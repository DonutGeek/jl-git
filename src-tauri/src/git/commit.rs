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
