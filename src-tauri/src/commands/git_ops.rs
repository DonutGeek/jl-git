use serde::Serialize;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::error::AppError;
use crate::git::{
    branch::{self, GitBranch},
    diff::{self, GitDiffResult},
    fs_list::{self, FsFileSizeResult, FsListResult},
    identity::{self, GitIdentity},
    log::{self, GitLogResult},
    oplog,
    path::{
        normalize_existing_dir, require_git_toplevel, validate_git_ref,
        validate_repo_relative_paths,
    },
    remote::{self, GitFetchResult, GitPullResult, GitPushResult},
    runner,
    show::{self, GitShowResult},
    status::{self, GitStatusResult},
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
pub struct GitCommitResult {
    commit_id: String,
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
pub fn git_log(
    path: String,
    skip: Option<u32>,
    limit: Option<u32>,
    r#ref: Option<String>,
) -> Result<GitLogResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let skip = skip.unwrap_or(0);
    let limit = limit.unwrap_or(50);

    log::get_log(&repo_path, skip, limit, r#ref.as_deref())
}

#[tauri::command]
pub fn git_show(path: String, rev: String) -> Result<GitShowResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    show::get_commit(&repo_path, &rev)
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
pub fn git_stage_all(path: String) -> Result<OkResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    runner::run_git(&repo_path, &["add", "-A"])?;

    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn git_unstage_all(path: String) -> Result<OkResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    runner::run_git(&repo_path, &["restore", "--staged", "."])?;

    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn git_commit(
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

    let commit_id = oplog::run_logged(&app, &path, "commit", || {
        crate::git::commit::commit(&repo_path, &message, &paths, &remove_paths, amend)
    })?;

    Ok(GitCommitResult { commit_id })
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
        oplog::run_logged(&app, &repo_key, "push", || {
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

#[tauri::command]
pub fn git_checkout(path: String, r#ref: String) -> Result<OkResult, AppError> {
    validate_git_ref(&r#ref)?;

    let repo_path = resolve_repo_path(&path)?;
    if branch::local_branch_exists(&repo_path, &r#ref)? {
        runner::run_git(&repo_path, &["switch", "--", r#ref.as_str()])?;

        return Ok(OkResult { ok: true });
    }

    if let Some((remote_name, local_name)) = remote_tracking_parts(&r#ref) {
        let is_remote_tracking_ref = branch::remote_branch_exists(&repo_path, &r#ref)?
            || branch::remote_exists(&repo_path, remote_name)?;

        if is_remote_tracking_ref {
            if branch::local_branch_exists(&repo_path, local_name)? {
                runner::run_git(&repo_path, &["switch", "--", local_name])?;
            } else {
                runner::run_git(
                    &repo_path,
                    &["switch", "-c", local_name, "--track", r#ref.as_str()],
                )?;
            }

            return Ok(OkResult { ok: true });
        }
    }

    runner::run_git(&repo_path, &["switch", "--", r#ref.as_str()])?;

    Ok(OkResult { ok: true })
}

/// 创建本地分支；默认 checkout 到新分支
#[tauri::command]
pub fn git_branch_create(
    path: String,
    name: String,
    checkout: Option<bool>,
    start_point: Option<String>,
) -> Result<OkResult, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::new("VALIDATION", "分支名不能为空"));
    }
    validate_git_ref(trimmed)?;
    if let Some(start) = start_point.as_deref() {
        validate_git_ref(start)?;
    }

    let repo_path = resolve_repo_path(&path)?;
    branch::create_branch(
        &repo_path,
        trimmed,
        start_point.as_deref(),
        checkout.unwrap_or(true),
    )?;

    Ok(OkResult { ok: true })
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
