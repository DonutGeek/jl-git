use std::path::Path;
use std::time::Instant;

use crate::error::AppError;
use crate::git::path::validate_git_ref;
use crate::git::runner;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitResetResult {
    pub ok: bool,
    /// 实际 reset 到的提交（完整 hash）
    pub target: String,
    pub elapsed_ms: u64,
}

/// 撤销提交：`git reset --mixed <target>`（默认变更回到工作区，不丢文件）
pub fn reset_mixed(repo_path: &Path, target: &str) -> Result<GitResetResult, AppError> {
    let trimmed = target.trim();
    validate_git_ref(trimmed)?;

    let started = Instant::now();
    let resolved = runner::run_git(repo_path, &["rev-parse", "--verify", trimmed])?;
    let target_hash = resolved.stdout.trim().to_string();
    if target_hash.is_empty() {
        return Err(AppError::new("VALIDATION", "无法解析撤销目标提交"));
    }

    runner::run_git(repo_path, &["reset", "--mixed", target_hash.as_str()])?;

    Ok(GitResetResult {
        ok: true,
        target: target_hash,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

/// 撤销最近一次提交：reset --mixed 到 HEAD~1
pub fn undo_last_commit(repo_path: &Path) -> Result<GitResetResult, AppError> {
    let parent = runner::run_git_allow_nonzero(repo_path, &["rev-parse", "--verify", "HEAD~1"])?;
    if parent.code != 0 {
        return Err(AppError::new(
            "VALIDATION",
            "当前已是仓库首个提交，无法再撤销",
        ));
    }
    let target = parent.stdout.trim();
    if target.is_empty() {
        return Err(AppError::new(
            "VALIDATION",
            "当前已是仓库首个提交，无法再撤销",
        ));
    }
    reset_mixed(repo_path, target)
}
