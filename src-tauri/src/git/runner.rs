use crate::error::AppError;
use crate::git::oplog;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub struct GitOutput {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

pub fn run_git(cwd: &Path, args: &[&str]) -> Result<GitOutput, AppError> {
    let output = run_git_allow_nonzero(cwd, args)?;
    ensure_success(args, output)
}

/// 向 git 写入 stdin（update-index -z / commit -F -）
pub fn run_git_with_stdin(cwd: &Path, args: &[&str], stdin: &[u8]) -> Result<GitOutput, AppError> {
    let started = Instant::now();
    let mut child = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            AppError::new("GIT_NOT_FOUND", "无法执行 git").with_details(error.to_string())
        })?;

    if let Some(mut pipe) = child.stdin.take() {
        pipe.write_all(stdin).map_err(|error| {
            AppError::new("GIT_FAILED", "写入 git stdin 失败").with_details(error.to_string())
        })?;
    }

    let output = child.wait_with_output().map_err(|error| {
        AppError::new("GIT_FAILED", "等待 git 进程失败").with_details(error.to_string())
    })?;

    let git_output = GitOutput {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        code: output.status.code().unwrap_or(-1),
    };
    record(args, &git_output, started);
    ensure_success(args, git_output)
}

pub fn run_git_allow_nonzero(cwd: &Path, args: &[&str]) -> Result<GitOutput, AppError> {
    run_git_allow_nonzero_timeout(cwd, args, None)
}

/// 带超时的 git 执行（fetch/push 等网络操作必须用，避免 UI/线程永久挂起）
pub fn run_git_timeout(
    cwd: &Path,
    args: &[&str],
    timeout: Duration,
) -> Result<GitOutput, AppError> {
    let output = run_git_allow_nonzero_timeout(cwd, args, Some(timeout))?;
    ensure_success(args, output)
}

fn record(args: &[&str], output: &GitOutput, started: Instant) {
    oplog::record_command(
        args,
        &output.stdout,
        &output.stderr,
        output.code,
        started.elapsed().as_millis() as u64,
    );
}

fn ensure_success(args: &[&str], output: GitOutput) -> Result<GitOutput, AppError> {
    let _ = args;
    if output.code == 0 {
        return Ok(output);
    }

    let stderr = output.stderr;
    let lower = stderr.to_lowercase();
    // HTTPS 无可用凭据 / 禁用终端提示时的常见失败
    if lower.contains("could not read password")
        || lower.contains("terminal prompts disabled")
        || lower.contains("authentication failed")
        || lower.contains("auth failed")
    {
        return Err(AppError::new(
            "GIT_AUTH",
            "远端需要身份验证。请先在终端登录 Git（或配置 SSH / 凭据助手）后再试",
        )
        .with_details(stderr));
    }

    let message = stderr
        .lines()
        .next()
        .unwrap_or("git 命令失败")
        .to_string();
    Err(AppError::new("GIT_FAILED", message).with_details(stderr))
}

fn run_git_allow_nonzero_timeout(
    cwd: &Path,
    args: &[&str],
    timeout: Option<Duration>,
) -> Result<GitOutput, AppError> {
    let started = Instant::now();

    // 无超时：沿用 output()，短命令更简单
    if timeout.is_none() {
        let output = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .map_err(|error| {
                AppError::new("GIT_NOT_FOUND", "无法执行 git").with_details(error.to_string())
            })?;

        let git_output = GitOutput {
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            code: output.status.code().unwrap_or(-1),
        };
        record(args, &git_output, started);
        return Ok(git_output);
    }

    let timeout = timeout.expect("timeout checked");
    let mut child = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            AppError::new("GIT_NOT_FOUND", "无法执行 git").with_details(error.to_string())
        })?;

    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();

    let stdout_handle = thread::spawn(move || {
        let mut buf = String::new();
        if let Some(mut pipe) = stdout_pipe {
            let _ = pipe.read_to_string(&mut buf);
        }
        buf
    });
    let stderr_handle = thread::spawn(move || {
        let mut buf = String::new();
        if let Some(mut pipe) = stderr_pipe {
            let _ = pipe.read_to_string(&mut buf);
        }
        buf
    });

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = stdout_handle.join().unwrap_or_default();
                let stderr = stderr_handle.join().unwrap_or_default();
                let git_output = GitOutput {
                    stdout,
                    stderr,
                    code: status.code().unwrap_or(-1),
                };
                record(args, &git_output, started);
                return Ok(git_output);
            }
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_handle.join();
                    let _ = stderr_handle.join();
                    oplog::record_command(
                        args,
                        "",
                        &format!("Git 操作超时（{}s）", timeout.as_secs()),
                        -1,
                        started.elapsed().as_millis() as u64,
                    );
                    return Err(AppError::new(
                        "GIT_TIMEOUT",
                        format!("Git 操作超时（{}s）", timeout.as_secs()),
                    ));
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                let _ = child.kill();
                return Err(AppError::new("GIT_FAILED", "等待 git 进程失败")
                    .with_details(error.to_string()));
            }
        }
    }
}
