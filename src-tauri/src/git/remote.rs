use std::path::Path;
use std::time::{Duration, Instant};

use crate::error::AppError;
use crate::git::path::validate_git_ref;
use crate::git::runner;

/// fetch 默认超时：避免网络/凭据挂起拖死界面
const FETCH_TIMEOUT: Duration = Duration::from_secs(120);
const PUSH_TIMEOUT: Duration = Duration::from_secs(180);

/// fetch 结果：供前端展示耗时与远端名
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFetchResult {
    pub ok: bool,
    pub remote: String,
    /// 耗时（毫秒）
    pub elapsed_ms: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPushResult {
    pub ok: bool,
    pub remote: String,
    pub elapsed_ms: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullResult {
    pub ok: bool,
    pub remote: String,
    pub elapsed_ms: u64,
}

/// 检查更新：fetch 远端跟踪引用。
/// `git -c protocol.version=2 fetch --prune --recurse-submodules=on-demand <remote>`
/// 使用系统 credential helper（如 macOS Keychain），不禁用凭据；
/// `GIT_TERMINAL_PROMPT=0` 避免无 TTY 时卡住，凭据缺失时返回明确错误。
pub fn fetch(repo_path: &Path, remote: Option<&str>) -> Result<GitFetchResult, AppError> {
    let remote = remote.unwrap_or("origin");
    validate_git_ref(remote)?;

    let started = Instant::now();
    runner::run_git_timeout(
        repo_path,
        &[
            "-c",
            "protocol.version=2",
            "fetch",
            "--prune",
            "--recurse-submodules=on-demand",
            remote,
        ],
        FETCH_TIMEOUT,
    )?;

    Ok(GitFetchResult {
        ok: true,
        remote: remote.to_string(),
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

/// 更新：pull 远端到当前分支（对齐 ugit：pull --recurse-submodules）。
/// 未指定 remote/branch 时走 upstream；不禁用 credential.helper。
pub fn pull(
    repo_path: &Path,
    remote: Option<&str>,
    branch: Option<&str>,
    rebase: bool,
) -> Result<GitPullResult, AppError> {
    if let Some(name) = remote {
        validate_git_ref(name)?;
    }
    if let Some(name) = branch {
        validate_git_ref(name)?;
    }

    let remote_label = remote.unwrap_or("origin").to_string();
    let started = Instant::now();

    let mut args: Vec<&str> = vec![
        "-c",
        "protocol.version=2",
        "pull",
        "--recurse-submodules",
        "--progress",
    ];
    if rebase {
        args.push("--rebase");
    }
    if let Some(name) = remote {
        args.push(name);
    }
    if let Some(name) = branch {
        args.push(name);
    }

    runner::run_git_timeout(repo_path, &args, FETCH_TIMEOUT)?;

    Ok(GitPullResult {
        ok: true,
        remote: remote_label,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

/// 推送到远端。默认 `git push`（跟随 upstream）；可指定 remote/branch。
pub fn push(
    repo_path: &Path,
    remote: Option<&str>,
    branch: Option<&str>,
    set_upstream: bool,
    force: bool,
) -> Result<GitPushResult, AppError> {
    if let Some(name) = remote {
        validate_git_ref(name)?;
    }
    if let Some(name) = branch {
        validate_git_ref(name)?;
    }

    let remote_label = remote.unwrap_or("origin").to_string();
    let started = Instant::now();

    let mut args: Vec<&str> = vec!["-c", "protocol.version=2", "push"];
    if force {
        args.push("--force-with-lease");
    }
    if set_upstream {
        args.push("--set-upstream");
    }
    if let Some(name) = remote {
        args.push(name);
    }
    if let Some(name) = branch {
        args.push(name);
    }

    runner::run_git_timeout(repo_path, &args, PUSH_TIMEOUT)?;

    Ok(GitPushResult {
        ok: true,
        remote: remote_label,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}
