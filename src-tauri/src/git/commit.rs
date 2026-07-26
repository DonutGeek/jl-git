use std::collections::HashSet;
use std::path::Path;

use crate::error::AppError;
use crate::git::path::validate_repo_relative_paths;
use crate::git::runner;

/// 将路径列表编码为 NUL 分隔（供 `update-index -z --stdin`）
fn encode_nul_paths(paths: &[String]) -> Vec<u8> {
    let mut buf = Vec::new();
    for path in paths {
        buf.extend_from_slice(path.as_bytes());
        buf.push(0);
    }
    buf
}

fn resolve_git_dir(repo_path: &Path) -> Result<std::path::PathBuf, AppError> {
    let output = runner::run_git(repo_path, &["rev-parse", "--git-dir"])?;
    let raw = output.stdout.trim();
    let git_dir = Path::new(raw);
    if git_dir.is_absolute() {
        Ok(git_dir.to_path_buf())
    } else {
        Ok(repo_path.join(git_dir))
    }
}

/// 合并 / 变基 / cherry-pick 进行中：index 已由 Git 维护，禁止 reset 重建。
fn is_sequencer_in_progress(repo_path: &Path) -> Result<bool, AppError> {
    let git_dir = resolve_git_dir(repo_path)?;
    Ok(git_dir.join("MERGE_HEAD").is_file()
        || git_dir.join("CHERRY_PICK_HEAD").is_file()
        || git_dir.join("rebase-merge").is_dir()
        || git_dir.join("rebase-apply").is_dir())
}

/// ugit 式提交：reset index → 精确 update-index → commit -F -
///
/// - `paths`：本次要纳入提交的全部相对路径（含删除项）
/// - `remove_paths`：其中需 `--force-remove` 的删除 / 重命名旧路径
///
/// 若处于 merge/rebase/cherry-pick：跳过 reset，直接 `git commit` 以正确结束操作并清除 MERGE_HEAD 等。
pub fn commit(
    repo_path: &Path,
    message: &str,
    paths: &[String],
    remove_paths: &[String],
    amend: bool,
) -> Result<String, AppError> {
    if message.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "提交信息不能为空"));
    }

    let sequencer = is_sequencer_in_progress(repo_path)?;

    if !sequencer && paths.is_empty() {
        return Err(AppError::new("VALIDATION", "没有可提交的变更"));
    }

    if !sequencer {
        validate_repo_relative_paths(paths)?;
        validate_repo_relative_paths(remove_paths)?;

        // 1. 清空暂存区，避免 index 与 UI「待提交」不一致
        runner::run_git(repo_path, &["reset", "--", "."])?;

        let remove_set: HashSet<&str> = remove_paths.iter().map(String::as_str).collect();
        // 删除项只走 force-remove；避免与 --add 同批导致 update-index 失败 / 卡住
        let add_paths: Vec<String> = paths
            .iter()
            .filter(|path| !remove_set.contains(path.as_str()))
            .cloned()
            .collect();

        // 2. 写入增改路径（不加 --verbose，避免大量输出堵管道）
        if !add_paths.is_empty() {
            runner::run_git_with_stdin(
                repo_path,
                &[
                    "update-index",
                    "--add",
                    "--remove",
                    "--replace",
                    "-z",
                    "--stdin",
                ],
                &encode_nul_paths(&add_paths),
            )?;
        }

        // 3. 删除项 / 重命名旧路径单独 force-remove
        if !remove_paths.is_empty() {
            runner::run_git_with_stdin(
                repo_path,
                &[
                    "update-index",
                    "--force-remove",
                    "--replace",
                    "-z",
                    "--stdin",
                ],
                &encode_nul_paths(remove_paths),
            )?;
        }
    }

    // 4. 从 stdin 读提交信息（支持多行）；合并中会生成 merge commit 并清除 MERGE_HEAD
    let mut commit_args = vec!["commit"];
    if amend {
        commit_args.push("--amend");
    }
    commit_args.extend_from_slice(&["-F", "-"]);
    runner::run_git_with_stdin(repo_path, &commit_args, message.as_bytes())?;

    let head = runner::run_git(repo_path, &["rev-parse", "HEAD"])?;
    Ok(head.stdout.trim().to_string())
}

/// 仅修改 HEAD 提交信息（不改 tree / 不重建 index）
pub fn amend_message(repo_path: &Path, rev: &str, message: &str) -> Result<String, AppError> {
    if message.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "提交信息不能为空"));
    }
    if rev.trim().is_empty() || rev.contains('\0') || rev.starts_with('-') {
        return Err(AppError::new("VALIDATION", "非法提交引用"));
    }
    if is_sequencer_in_progress(repo_path)? {
        return Err(AppError::new(
            "VALIDATION",
            "合并或变基进行中，无法修改提交信息",
        ));
    }

    let head = runner::run_git(repo_path, &["rev-parse", "HEAD"])?;
    let target = runner::run_git(repo_path, &["rev-parse", rev])?;
    if head.stdout.trim() != target.stdout.trim() {
        return Err(AppError::new(
            "VALIDATION",
            "只能修改当前 HEAD 提交的信息",
        ));
    }

    runner::run_git_with_stdin(
        repo_path,
        &["commit", "--amend", "-F", "-"],
        message.as_bytes(),
    )?;

    let next_head = runner::run_git(repo_path, &["rev-parse", "HEAD"])?;
    Ok(next_head.stdout.trim().to_string())
}
