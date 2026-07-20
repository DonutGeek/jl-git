use serde::Serialize;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::error::AppError;
use crate::git::{
    blame::{self, GitBlameResult},
    branch::{self, GitBranch},
    branch_compare::{self, GitBranchCompareResult},
    conflict::{self, ConflictSide, GitWorktreeFileResult},
    diff::{self, GitDiffResult, GitStagedDiffResult},
    fs_list::{self, FsFileSizeResult, FsListResult},
    identity::{self, GitIdentity},
    log::{self, GitLogResult},
    media::{self, GitFileMedia},
    merge::{self, GitMergeResult, MergeMode},
    oplog,
    path::{
        normalize_existing_dir, require_git_toplevel, validate_git_ref,
        validate_repo_relative_paths,
    },
    remote::{self, GitFetchResult, GitPullResult, GitPushResult, GitRemote},
    repo_state::{self, GitRepoState},
    reset::{self, GitResetResult},
    runner,
    show::{
        self, GitCommitChangeSizeResult, GitCommitMessageResult, GitContainingBranchesResult,
        GitLsTreeResult, GitShowResult,
    },
    status::{self, GitStatusResult},
    tag::{self, GitTag},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResult {
    ok: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchesResult {
    branches: Vec<GitBranch>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitTagsResult {
    tags: Vec<GitTag>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitTagCreateResult {
    ok: bool,
    pushed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    push_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitResult {
    commit_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemotesResult {
    remotes: Vec<GitRemote>,
}

#[tauri::command]
pub fn git_remotes(path: String) -> Result<GitRemotesResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let remotes = remote::list_remotes(&repo_path)?;
    Ok(GitRemotesResult { remotes })
}

#[tauri::command]
pub fn git_status(path: String) -> Result<GitStatusResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;

    status::get_status(&repo_path)
}

/// 当前仓库生效的 Git 用户身份（user.name / user.email）
#[tauri::command]
pub fn git_identity(path: String) -> Result<GitIdentity, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    identity::get_identity(&repo_path)
}

/// 全局 Git 身份（无仓库时状态栏使用）
#[tauri::command]
pub fn git_identity_global() -> Result<GitIdentity, AppError> {
    identity::get_global_identity()
}

/// 写入全局 Git 用户名 / 邮箱
#[tauri::command]
pub fn git_identity_global_set(
    name: Option<String>,
    email: Option<String>,
) -> Result<GitIdentity, AppError> {
    identity::set_global_identity(name.as_deref(), email.as_deref())
}

/// 列出仓库内相对目录一层子项（目录树用）
#[tauri::command]
pub fn fs_list_dir(path: String, relative: Option<String>) -> Result<FsListResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let relative = relative.unwrap_or_default();
    fs_list::list_dir(&repo_path, &relative)
}

/// 仓库内相对文件大小（工作区优先；已删则回退 HEAD / index）
#[tauri::command]
pub fn fs_file_size(path: String, file_path: String) -> Result<FsFileSizeResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    fs_list::file_size(&repo_path, &file_path)
}

#[tauri::command]
pub fn git_branches(
    path: String,
    include_remote: Option<bool>,
) -> Result<GitBranchesResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let include_remote = include_remote.unwrap_or(false);

    Ok(GitBranchesResult {
        branches: branch::list_branches(&repo_path, include_remote)?,
    })
}

#[tauri::command]
pub fn git_tags(path: String) -> Result<GitTagsResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    Ok(GitTagsResult {
        tags: tag::list_tags(&repo_path)?,
    })
}

#[tauri::command]
pub async fn git_tag_create(
    app: AppHandle,
    path: String,
    name: String,
    message: Option<String>,
    r#ref: Option<String>,
    push: Option<bool>,
    remote: Option<String>,
) -> Result<GitTagCreateResult, AppError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::new("VALIDATION", "标签名称不能为空"));
    }
    let message = message.filter(|value| !value.trim().is_empty());
    let target = r#ref.filter(|value| !value.trim().is_empty());
    if let Some(target) = target.as_deref() {
        validate_git_ref(target)?;
    }
    let should_push = push.unwrap_or(false);
    let remote = remote.filter(|value| !value.trim().is_empty());
    if should_push && remote.is_none() {
        return Err(AppError::new("VALIDATION", "未配置可推送的远端"));
    }

    let repo_path = resolve_repo_path(&path)?;
    let repo_key = path;
    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "createTag", || {
            tag::create_tag(&repo_path, &name, message.as_deref(), target.as_deref())?;
            if !should_push {
                return Ok(GitTagCreateResult {
                    ok: true,
                    pushed: false,
                    push_error: None,
                });
            }

            let push_result =
                tag::push_tag(&repo_path, remote.as_deref().unwrap_or_default(), &name);
            match push_result {
                Ok(()) => Ok(GitTagCreateResult {
                    ok: true,
                    pushed: true,
                    push_error: None,
                }),
                Err(error) => Ok(GitTagCreateResult {
                    ok: true,
                    pushed: false,
                    push_error: Some(error.message),
                }),
            }
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "创建标签任务失败").with_details(error.to_string())
    })?
}

#[tauri::command]
pub async fn git_tag_delete(
    app: AppHandle,
    path: String,
    name: String,
) -> Result<OkResult, AppError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::new("VALIDATION", "标签名称不能为空"));
    }
    let repo_path = resolve_repo_path(&path)?;
    let repo_key = path;
    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "deleteTag", || {
            tag::delete_tag(&repo_path, &name)?;
            Ok(OkResult { ok: true })
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "删除标签任务失败").with_details(error.to_string())
    })?
}

#[tauri::command]
pub fn git_log(
    path: String,
    skip: Option<u32>,
    limit: Option<u32>,
    r#ref: Option<String>,
    // 为 true 时等价 `git log --all`；与 ref 互斥
    all: Option<bool>,
    // default | topo | date；缺省为 git 默认序
    order: Option<String>,
    // 可选：仅跟踪该相对路径的提交
    file_path: Option<String>,
    // 可选：作者匹配模式（多条为 OR，对应多个 `--author`）
    authors: Option<Vec<String>>,
    // 为 true 时等价 `git log --reverse`
    reverse: Option<bool>,
) -> Result<GitLogResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let skip = skip.unwrap_or(0);
    let limit = limit.unwrap_or(50);

    log::get_log(
        &repo_path,
        skip,
        limit,
        r#ref.as_deref(),
        all.unwrap_or(false),
        order.as_deref(),
        file_path.as_deref(),
        authors.as_deref(),
        reverse.unwrap_or(false),
    )
}

#[tauri::command]
pub fn git_blame(
    path: String,
    file_path: String,
    rev: Option<String>,
) -> Result<GitBlameResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    blame::get_blame(&repo_path, &file_path, rev.as_deref())
}

#[tauri::command]
pub fn git_show(path: String, rev: String) -> Result<GitShowResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    show::get_commit(&repo_path, &rev)
}

/// 读取完整提交文案（标题与正文），用于提交信息历史回填。
#[tauri::command]
pub fn git_commit_message(path: String, rev: String) -> Result<GitCommitMessageResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    show::get_commit_message(&repo_path, &rev)
}

/// 列出某提交下全部文件路径（用于历史详情「显示所有文件」）
#[tauri::command]
pub fn git_ls_tree(path: String, rev: String) -> Result<GitLsTreeResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    show::list_tree_paths(&repo_path, &rev)
}

/// 包含该提交的分支列表（历史详情「显示分支」）
#[tauri::command]
pub fn git_commit_containing_branches(
    path: String,
    rev: String,
) -> Result<GitContainingBranchesResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    show::containing_branches(&repo_path, &rev)
}

/// 改动文件数与 blob 总大小（历史详情「显示大小」）
#[tauri::command]
pub fn git_commit_change_size(
    path: String,
    rev: String,
) -> Result<GitCommitChangeSizeResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    show::change_size(&repo_path, &rev)
}

/// 工作区 / 暂存区单文件 Diff（含 Monaco 两侧文本）
#[tauri::command]
pub fn git_diff(
    path: String,
    file_path: String,
    staged: Option<bool>,
    max_bytes: Option<usize>,
    encoding: Option<String>,
) -> Result<GitDiffResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    diff::get_diff(
        &repo_path,
        &file_path,
        staged.unwrap_or(false),
        max_bytes,
        encoding.as_deref(),
    )
}

/// 读取单侧文件媒体（图片等）内容，供 Diff/File 预览非文本文件
///
/// `source`：`worktree` | `index` | Git rev（如 `HEAD`、commit）
#[tauri::command]
pub fn git_file_media(
    path: String,
    file_path: String,
    source: String,
    max_bytes: Option<usize>,
) -> Result<GitFileMedia, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    media::get_file_media(&repo_path, &file_path, &source, max_bytes)
}

/// 两个指定 Git ref 之间的改动文件列表；只读，供分支比较窗口使用。
#[tauri::command]
pub fn git_branch_compare(
    path: String,
    base: String,
    target: String,
) -> Result<GitBranchCompareResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    branch_compare::get_changed_files(&repo_path, &base, &target)
}

/// 两个指定 Git ref 内单文件的只读前后文本与 patch。
#[tauri::command]
pub fn git_branch_file_diff(
    path: String,
    base: String,
    target: String,
    file_path: String,
    max_bytes: Option<usize>,
    encoding: Option<String>,
) -> Result<GitDiffResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    branch_compare::get_file_diff(
        &repo_path,
        &base,
        &target,
        &file_path,
        max_bytes,
        encoding.as_deref(),
    )
}

/// 读取有限长度的暂存区 Diff，供 AI 生成提交文案使用。
#[tauri::command]
pub fn git_staged_diff(
    path: String,
    max_bytes: Option<usize>,
) -> Result<GitStagedDiffResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    diff::get_staged_diff(&repo_path, max_bytes)
}

/// 历史提交内单文件相对 parent 的前后对比（Monaco 两侧文本）
///
/// `parent_rev` 传空字符串或缺省表示根提交（无父，相对空树）
#[tauri::command]
pub fn git_commit_file_diff(
    path: String,
    file_path: String,
    commit_rev: String,
    parent_rev: Option<String>,
    max_bytes: Option<usize>,
    encoding: Option<String>,
) -> Result<GitDiffResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let parent = parent_rev.filter(|value| !value.is_empty());
    diff::get_commit_file_diff(
        &repo_path,
        &file_path,
        &commit_rev,
        parent.as_deref(),
        max_bytes,
        encoding.as_deref(),
    )
}

#[tauri::command]
pub fn git_stage(path: String, paths: Vec<String>) -> Result<OkResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    run_path_command(&repo_path, &["add", "--"], &paths)
}

#[tauri::command]
pub fn git_unstage(path: String, paths: Vec<String>) -> Result<OkResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    run_path_command(&repo_path, &["restore", "--staged", "--"], &paths)
}

#[tauri::command]
pub async fn git_stage_all(app: AppHandle, path: String) -> Result<OkResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "stageAll", || {
            runner::run_git(&repo_path, &["add", "-A"])?;
            Ok(OkResult { ok: true })
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "stage all 任务失败").with_details(error.to_string())
    })?
}

#[tauri::command]
pub async fn git_unstage_all(app: AppHandle, path: String) -> Result<OkResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "unstageAll", || {
            runner::run_git(&repo_path, &["restore", "--staged", "."])?;
            Ok(OkResult { ok: true })
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "unstage all 任务失败").with_details(error.to_string())
    })?
}

#[tauri::command]
pub async fn git_commit(
    app: AppHandle,
    path: String,
    message: String,
    paths: Vec<String>,
    remove_paths: Option<Vec<String>>,
    amend: Option<bool>,
) -> Result<GitCommitResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let remove_paths = remove_paths.unwrap_or_default();
    let amend = amend.unwrap_or(false);
    let repo_key = path;

    // 阻塞线程池执行，避免同步 command 卡住事件推送（日志才能实时刷新）
    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "commit", || {
            crate::git::commit::commit(&repo_path, &message, &paths, &remove_paths, amend)
        })
        .map(|commit_id| GitCommitResult { commit_id })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "commit 任务失败").with_details(error.to_string())
    })?
}

/// 检查更新：fetch 远端（默认 origin），在阻塞线程池执行以免卡住 UI
#[tauri::command]
pub async fn git_fetch(
    app: AppHandle,
    path: String,
    remote: Option<String>,
) -> Result<GitFetchResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let remote_name = remote;
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "fetch", || {
            remote::fetch(&repo_path, remote_name.as_deref())
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "fetch 任务失败").with_details(error.to_string())
    })?
}

/// 更新：pull 远端（默认 origin + 当前分支，或跟随 upstream）
#[tauri::command]
pub async fn git_pull(
    app: AppHandle,
    path: String,
    remote: Option<String>,
    branch: Option<String>,
    rebase: Option<bool>,
) -> Result<GitPullResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let remote_name = remote;
    let branch_name = branch;
    let rebase = rebase.unwrap_or(false);
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "pull", || {
            remote::pull(
                &repo_path,
                remote_name.as_deref(),
                branch_name.as_deref(),
                rebase,
            )
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "pull 任务失败").with_details(error.to_string())
    })?
}

/// 推送到远端（阻塞线程池 + 超时）
#[tauri::command]
pub async fn git_push(
    app: AppHandle,
    path: String,
    remote: Option<String>,
    branch: Option<String>,
    set_upstream: Option<bool>,
    force: Option<bool>,
) -> Result<GitPushResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let remote_name = remote;
    let branch_name = branch;
    let set_upstream = set_upstream.unwrap_or(false);
    let force = force.unwrap_or(false);
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        let label = if set_upstream { "publish" } else { "push" };
        oplog::run_logged(&app, &repo_key, label, || {
            remote::push(
                &repo_path,
                remote_name.as_deref(),
                branch_name.as_deref(),
                set_upstream,
                force,
            )
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "push 任务失败").with_details(error.to_string())
    })?
}

/// 撤销最近提交：`git reset --mixed HEAD~1`（变更回到工作区）
#[tauri::command]
pub async fn git_undo_commit(
    app: AppHandle,
    path: String,
    target: Option<String>,
) -> Result<GitResetResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let target = target;
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "undo", || {
            if let Some(rev) = target.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                reset::reset_mixed(&repo_path, rev)
            } else {
                reset::undo_last_commit(&repo_path)
            }
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "撤销提交任务失败").with_details(error.to_string())
    })?
}

/// 将指定 ref 合并到当前检出的本地分支。
#[tauri::command]
pub async fn git_merge(
    app: AppHandle,
    path: String,
    r#ref: String,
    mode: Option<MergeMode>,
    autostash: Option<bool>,
) -> Result<GitMergeResult, AppError> {
    let source = r#ref.trim().to_string();
    if source.is_empty() {
        return Err(AppError::new("VALIDATION", "合并分支不能为空"));
    }
    validate_git_ref(&source)?;

    let repo_path = resolve_repo_path(&path)?;
    let repo_key = path;
    let mode = mode.unwrap_or(MergeMode::Default);
    let autostash = autostash.unwrap_or(false);

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "merge", || {
            merge::merge(&repo_path, &source, mode, autostash)
        })
    })
    .await
    .map_err(|error| AppError::new("INTERNAL", "合并任务失败").with_details(error.to_string()))?
}

/// 仓库进行中状态（合并/变基等）与冲突文件列表
#[tauri::command]
pub fn git_repo_state(path: String) -> Result<GitRepoState, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    repo_state::get_repo_state(&repo_path)
}

/// 冲突整文件取 ours / theirs 并标记已解决
#[tauri::command]
pub async fn git_conflict_take(
    app: AppHandle,
    path: String,
    file_path: String,
    side: ConflictSide,
) -> Result<conflict::OkResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let file_path = file_path;
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "conflictTake", || {
            conflict::take_side(&repo_path, &file_path, side)
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "冲突处理任务失败").with_details(error.to_string())
    })?
}

/// 读取工作区文件文本（含冲突标记）
#[tauri::command]
pub fn git_read_worktree_file(
    path: String,
    file_path: String,
    max_bytes: Option<usize>,
    encoding: Option<String>,
) -> Result<GitWorktreeFileResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    conflict::read_worktree_file(
        &repo_path,
        &file_path,
        max_bytes,
        encoding.as_deref(),
    )
}

/// 写入工作区文件；可选 stage 标记已解决
#[tauri::command]
pub async fn git_write_worktree_file(
    app: AppHandle,
    path: String,
    file_path: String,
    content: String,
    stage: Option<bool>,
    encoding: Option<String>,
) -> Result<conflict::OkResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let file_path = file_path;
    let content = content;
    let stage = stage.unwrap_or(false);
    let encoding = encoding;
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "writeWorktree", || {
            conflict::write_worktree_file(
                &repo_path,
                &file_path,
                &content,
                stage,
                encoding.as_deref(),
            )
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "写入工作区任务失败").with_details(error.to_string())
    })?
}

/// 标记冲突文件已解决（`git add`）
#[tauri::command]
pub async fn git_conflict_mark_resolved(
    app: AppHandle,
    path: String,
    file_path: String,
) -> Result<conflict::OkResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let file_path = file_path;
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "conflictResolve", || {
            conflict::mark_resolved(&repo_path, &file_path)
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "标记已解决任务失败").with_details(error.to_string())
    })?
}

#[tauri::command]
pub async fn git_checkout(
    app: AppHandle,
    path: String,
    r#ref: String,
) -> Result<OkResult, AppError> {
    validate_git_ref(&r#ref)?;

    let repo_path = resolve_repo_path(&path)?;
    let target = r#ref;
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "checkout", || {
            checkout_ref(&repo_path, &target)?;
            Ok(OkResult { ok: true })
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "切换分支任务失败").with_details(error.to_string())
    })?
}

/// 创建本地分支；默认 checkout 到新分支
#[tauri::command]
pub async fn git_branch_create(
    app: AppHandle,
    path: String,
    name: String,
    checkout: Option<bool>,
    start_point: Option<String>,
) -> Result<OkResult, AppError> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::new("VALIDATION", "分支名不能为空"));
    }
    validate_git_ref(&trimmed)?;
    if let Some(start) = start_point.as_deref() {
        validate_git_ref(start)?;
    }

    let repo_path = resolve_repo_path(&path)?;
    let do_checkout = checkout.unwrap_or(true);
    let start = start_point;
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "createBranch", || {
            branch::create_branch(
                &repo_path,
                &trimmed,
                start.as_deref(),
                do_checkout,
            )?;
            Ok(OkResult { ok: true })
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "创建分支任务失败").with_details(error.to_string())
    })?
}

/// 删除本地分支；可选同时删除远端同名分支
#[tauri::command]
pub async fn git_branch_delete(
    app: AppHandle,
    path: String,
    name: String,
    force: Option<bool>,
    delete_remote: Option<bool>,
    remote: Option<String>,
) -> Result<OkResult, AppError> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::new("VALIDATION", "分支名不能为空"));
    }
    validate_git_ref(&trimmed)?;

    let repo_path = resolve_repo_path(&path)?;
    let force = force.unwrap_or(false);
    let delete_remote = delete_remote.unwrap_or(false);
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    if delete_remote {
        validate_git_ref(&remote_name)?;
    }
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "deleteBranch", || {
            branch::delete_branch(&repo_path, &trimmed, force)?;
            if delete_remote {
                branch::delete_remote_branch(&repo_path, &remote_name, &trimmed)?;
            }
            Ok(OkResult { ok: true })
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "删除分支任务失败").with_details(error.to_string())
    })?
}

/// 重命名本地分支
#[tauri::command]
pub async fn git_branch_rename(
    app: AppHandle,
    path: String,
    old_name: String,
    new_name: String,
) -> Result<OkResult, AppError> {
    let old = old_name.trim().to_string();
    let new = new_name.trim().to_string();
    if old.is_empty() || new.is_empty() {
        return Err(AppError::new("VALIDATION", "分支名不能为空"));
    }
    validate_git_ref(&old)?;
    validate_git_ref(&new)?;

    let repo_path = resolve_repo_path(&path)?;
    let repo_key = path;

    tauri::async_runtime::spawn_blocking(move || {
        oplog::run_logged(&app, &repo_key, "renameBranch", || {
            branch::rename_branch(&repo_path, &old, &new)?;
            Ok(OkResult { ok: true })
        })
    })
    .await
    .map_err(|error| {
        AppError::new("INTERNAL", "重命名分支任务失败").with_details(error.to_string())
    })?
}

fn checkout_ref(repo_path: &std::path::Path, target: &str) -> Result<(), AppError> {
    if branch::local_branch_exists(repo_path, target)? {
        branch::checkout_local_branch(repo_path, target)?;
        return Ok(());
    }

    if let Some((remote_name, local_name)) = remote_tracking_parts(target) {
        let is_remote_tracking_ref = branch::remote_branch_exists(repo_path, target)?
            || branch::remote_exists(repo_path, remote_name)?;

        if is_remote_tracking_ref {
            if branch::local_branch_exists(repo_path, local_name)? {
                branch::checkout_local_branch(repo_path, local_name)?;
            } else {
                runner::run_git(
                    repo_path,
                    &["switch", "-c", local_name, "--track", target],
                )?;
                runner::run_git(
                    repo_path,
                    &["submodule", "update", "--init", "--recursive"],
                )?;
            }
            return Ok(());
        }
    }

    runner::run_git(repo_path, &["checkout", "--progress", target, "--"])?;
    runner::run_git(
        repo_path,
        &["submodule", "update", "--init", "--recursive"],
    )?;
    Ok(())
}

fn remote_tracking_parts(candidate: &str) -> Option<(&str, &str)> {
    let (remote_name, local_name) = candidate.split_once('/')?;
    if remote_name.is_empty() || local_name.is_empty() {
        return None;
    }

    Some((remote_name, local_name))
}

fn resolve_repo_path(path: &str) -> Result<PathBuf, AppError> {
    let path = normalize_existing_dir(path)?;
    require_git_toplevel(&path)
}

fn run_path_command(
    repo_path: &PathBuf,
    prefix: &[&str],
    paths: &[String],
) -> Result<OkResult, AppError> {
    if paths.is_empty() {
        return Err(AppError::new("VALIDATION", "路径不能为空"));
    }

    validate_repo_relative_paths(paths)?;

    let mut args: Vec<String> = prefix.iter().map(|value| (*value).to_string()).collect();
    args.extend(paths.iter().cloned());
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    runner::run_git(repo_path, &arg_refs)?;

    Ok(OkResult { ok: true })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_local_name_from_remote_tracking_ref() {
        assert_eq!(
            remote_tracking_parts("origin/feature/task"),
            Some(("origin", "feature/task"))
        );
    }

    #[test]
    fn ignores_refs_without_remote_prefix() {
        assert_eq!(remote_tracking_parts("main"), None);
    }
}
