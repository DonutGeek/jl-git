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

/// ugit 式提交：reset index → 精确 update-index → commit -F -
///
/// - `paths`：本次要纳入提交的全部相对路径（含删除项）
/// - `remove_paths`：其中需 `--force-remove` 的删除 / 重命名旧路径
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

    if paths.is_empty() {
        return Err(AppError::new("VALIDATION", "没有可提交的变更"));
    }

    validate_repo_relative_paths(paths)?;
    validate_repo_relative_paths(remove_paths)?;

    // 1. 清空暂存区，避免 index 与 UI「待提交」不一致
    runner::run_git(repo_path, &["reset", "--", "."])?;

    // 2. 按待提交列表重建 index（增/改/删候选）
    runner::run_git_with_stdin(
        repo_path,
        &[
            "update-index",
            "--add",
            "--remove",
            "--replace",
            "--verbose",
            "-z",
            "--stdin",
        ],
        &encode_nul_paths(paths),
    )?;

    // 3. 删除项单独 force-remove（工作区文件已不存在时必须）
    if !remove_paths.is_empty() {
        runner::run_git_with_stdin(
            repo_path,
            &[
                "update-index",
                "--add",
                "--remove",
                "--force-remove",
                "--replace",
                "--verbose",
                "-z",
                "--stdin",
            ],
            &encode_nul_paths(remove_paths),
        )?;
    }

    // 4. 从 stdin 读提交信息（支持多行）
    let mut commit_args = vec!["commit"];
    if amend {
        commit_args.push("--amend");
    }
    commit_args.extend_from_slice(&["-F", "-"]);
    runner::run_git_with_stdin(repo_path, &commit_args, message.as_bytes())?;

    let head = runner::run_git(repo_path, &["rev-parse", "HEAD"])?;
    Ok(head.stdout.trim().to_string())
}
