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

fn git_command(cwd: &Path, args: &[&str]) -> Command {
    let mut command = Command::new("git");
    // 禁用彩色 / 交互提示，避免 stderr 被 ANSI 污染、toast 不可读
    command
        .args(["-c", "color.ui=never", "-c", "color.advice=never"])
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("NO_COLOR", "1")
        .env("TERM", "dumb");
    command
}

pub fn run_git(cwd: &Path, args: &[&str]) -> Result<GitOutput, AppError> {
    let output = run_git_allow_nonzero(cwd, args)?;
    ensure_success(args, output)
}

/// 向 git 写入 stdin（update-index -z / commit -F -）
/// 边写 stdin 边读 stdout/stderr，避免管道堵死
pub fn run_git_with_stdin(cwd: &Path, args: &[&str], stdin: &[u8]) -> Result<GitOutput, AppError> {
    let started = Instant::now();
    oplog::begin_command(args);
    let mut child = git_command(cwd, args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            AppError::new("GIT_NOT_FOUND", "无法执行 git").with_details(error.to_string())
        })?;

    let mut stdin_pipe = child.stdin.take().ok_or_else(|| {
        AppError::new("GIT_FAILED", "无法打开 git stdin")
    })?;
    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();

    let stdin_bytes = stdin.to_vec();
    let stdin_handle = thread::spawn(move || -> Result<(), String> {
        stdin_pipe
            .write_all(&stdin_bytes)
            .map_err(|error| error.to_string())?;
        drop(stdin_pipe);
        Ok(())
    });

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

    let status = child.wait().map_err(|error| {
        AppError::new("GIT_FAILED", "等待 git 进程失败").with_details(error.to_string())
    })?;

    if let Err(error) = stdin_handle.join().unwrap_or(Ok(())) {
        return Err(AppError::new("GIT_FAILED", "写入 git stdin 失败").with_details(error));
    }

    let git_output = GitOutput {
        stdout: stdout_handle.join().unwrap_or_default(),
        stderr: stderr_handle.join().unwrap_or_default(),
        code: status.code().unwrap_or(-1),
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

    // hook 输出常混在 stdout / stderr
    let combined = strip_ansi(&format!("{}\n{}", output.stdout, output.stderr));
    let lower = combined.to_lowercase();

    if lower.contains("could not read password")
        || lower.contains("terminal prompts disabled")
        || lower.contains("authentication failed")
        || lower.contains("auth failed")
    {
        return Err(AppError::new(
            "GIT_AUTH",
            "远端需要身份验证。请先在终端登录 Git（或配置 SSH / 凭据助手）后再试",
        )
        .with_details(combined));
    }

    // commitlint / Conventional Commits
    if lower.contains("commitlint")
        || lower.contains("subject-empty")
        || lower.contains("type-empty")
        || lower.contains("subject may not be empty")
        || lower.contains("type may not be empty")
    {
        return Err(AppError::new(
            "GIT_FAILED",
            "提交信息不符合规范，请使用如 feat: 描述 的 Conventional Commits 格式",
        )
        .with_details(combined));
    }

    let message =
        pick_error_message(&combined).unwrap_or_else(|| "git 命令失败".to_string());
    Err(AppError::new("GIT_FAILED", message).with_details(combined))
}

/// 去掉 CSI / OSC 等 ANSI 转义，避免 toast 出现 `38;2;...` 乱码
fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            out.push(ch);
            continue;
        }
        match chars.next() {
            Some('[') => {
                // CSI: ESC [ ... final byte @-~
                for next in chars.by_ref() {
                    if ('\u{40}'..='\u{7e}').contains(&next) {
                        break;
                    }
                }
            }
            Some(']') => {
                // OSC: ESC ] ... BEL 或 ESC \
                while let Some(next) = chars.next() {
                    if next == '\u{07}' {
                        break;
                    }
                    if next == '\u{1b}' && chars.peek() == Some(&'\\') {
                        let _ = chars.next();
                        break;
                    }
                }
            }
            Some(_) | None => {}
        }
    }
    out
}

fn is_decorative_line(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return true;
    }
    // lefthook / box 边框
    let box_chars = "─│╭╮╰╯┌┐└┘═║╔╗╚╝━┃┏┓┗┛";
    let box_count = trimmed
        .chars()
        .filter(|ch| box_chars.contains(*ch) || *ch == '-' || *ch == '|' || *ch == ' ')
        .count();
    if box_count * 10 >= trimmed.chars().count() * 7 {
        return true;
    }
    let lower = trimmed.to_lowercase();
    lower.starts_with("lefthook")
        || lower.contains("hook:")
        || lower.starts_with("summary:")
        || trimmed.starts_with('┃')
        || trimmed.starts_with('│')
}

fn looks_like_error_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.contains("error")
        || lower.contains("fatal")
        || lower.contains("failed")
        || lower.contains("✖")
        || lower.contains("✗")
        || lower.contains("subject-empty")
        || lower.contains("type-empty")
        || lower.contains("commitlint")
        || lower.contains("exit status")
        || lower.contains("rejected")
}

fn pick_error_message(text: &str) -> Option<String> {
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !is_decorative_line(line))
        .collect();

    if let Some(line) = lines.iter().rev().find(|line| looks_like_error_line(line)) {
        return Some((*line).to_string());
    }

    lines.last().map(|line| (*line).to_string())
}

fn run_git_allow_nonzero_timeout(
    cwd: &Path,
    args: &[&str],
    timeout: Option<Duration>,
) -> Result<GitOutput, AppError> {
    let started = Instant::now();

    if timeout.is_none() {
        oplog::begin_command(args);
        let output = git_command(cwd, args).output().map_err(|error| {
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
    oplog::begin_command(args);
    let mut child = git_command(cwd, args)
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

#[cfg(test)]
mod tests {
    use super::{pick_error_message, strip_ansi};

    #[test]
    fn strips_csi_color_sequences() {
        let raw = "\u{1b}[38;2;0;0;0m╭\u{1b}[38;2;5;5;5m─\u{1b}[m\nerror: bad file";
        let cleaned = strip_ansi(raw);
        assert!(cleaned.contains('╭'));
        assert!(!cleaned.contains("38;2"));
        assert_eq!(
            pick_error_message(&cleaned).as_deref(),
            Some("error: bad file")
        );
    }

    #[test]
    fn prefers_commitlint_style_errors() {
        let text = "\
╭──────╮
│ lefthook hook: pre-commit │
╰──────╯
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]
exit status 1
";
        assert_eq!(
            pick_error_message(text).as_deref(),
            Some("exit status 1")
        );
    }

    #[test]
    fn prefers_non_empty_error_line() {
        let text = "\n\nerror: path not found\n";
        assert_eq!(
            pick_error_message(text).as_deref(),
            Some("error: path not found")
        );
    }
}
