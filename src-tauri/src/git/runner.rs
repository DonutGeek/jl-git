use crate::error::AppError;
use crate::git::oplog;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug)]
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
    // 用户配置的额外 PATH（husky 钩子继承，便于找到 node/pnpm）
    crate::git::env_path::apply_to_command(&mut command);
    // Windows：隐藏控制台，否则每次 git 都会闪黑窗
    crate::process_cmd::configure_background_command(&mut command);
    command
}

pub fn run_git(cwd: &Path, args: &[&str]) -> Result<GitOutput, AppError> {
    let output = run_git_allow_nonzero(cwd, args)?;
    ensure_success(args, output)
}

/// commit/push hook 可能刷屏；保留前缀供报错，超额丢弃以免整进程 OOM 闪退
const CAPPED_STDIN_STDOUT_MAX_BYTES: usize = 256 * 1024;
const CAPPED_STDIN_STDERR_MAX_BYTES: usize = 128 * 1024;

/// 向 git 写入 stdin（update-index -z / commit -F -）
/// 边写 stdin 边读 stdout/stderr，避免管道堵死；输出限长并继续排空，不 kill 子进程（让 hook 有机会收尾还原 stash）
pub fn run_git_with_stdin(cwd: &Path, args: &[&str], stdin: &[u8]) -> Result<GitOutput, AppError> {
    let started = Instant::now();
    oplog::begin_command(args);
    let mut child = git_command(cwd, args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| AppError::git_not_found(error.to_string()))?;

    let mut stdin_pipe = child
        .stdin
        .take()
        .ok_or_else(|| AppError::new("GIT_FAILED", "无法打开 git stdin"))?;
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
        if let Some(pipe) = stdout_pipe {
            read_capped_and_drain(pipe, CAPPED_STDIN_STDOUT_MAX_BYTES)
        } else {
            String::new()
        }
    });
    let stderr_handle = thread::spawn(move || {
        if let Some(pipe) = stderr_pipe {
            read_capped_and_drain(pipe, CAPPED_STDIN_STDERR_MAX_BYTES)
        } else {
            String::new()
        }
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

/// 读取最多 `max_bytes`，超出部分继续排空但不保留，避免管道堵死与内存暴涨
fn read_capped_and_drain(mut pipe: impl Read, max_bytes: usize) -> String {
    let max_bytes = max_bytes.max(1);
    let mut kept = Vec::with_capacity(max_bytes.min(64 * 1024));
    let mut chunk = [0_u8; 8_192];
    loop {
        let n = match pipe.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        if kept.len() < max_bytes {
            let room = max_bytes - kept.len();
            kept.extend_from_slice(&chunk[..n.min(room)]);
        }
        // 超额字节故意丢弃，继续读直到 EOF
    }
    String::from_utf8_lossy(&kept).into_owned()
}

pub fn run_git_allow_nonzero(cwd: &Path, args: &[&str]) -> Result<GitOutput, AppError> {
    run_git_allow_nonzero_timeout(cwd, args, None)
}

const CAPPED_STDERR_MAX_BYTES: usize = 65_536;

/// 执行 git 并限制 stdout 读取字节数。
/// 超限则截断并 kill 子进程，避免大 diff 一次性进内存导致进程/WebView 闪退。
/// 返回 `(stdout_text, truncated)`。
pub fn run_git_stdout_capped(
    cwd: &Path,
    args: &[&str],
    max_stdout_bytes: usize,
) -> Result<(String, bool), AppError> {
    let max_stdout_bytes = max_stdout_bytes.max(1);
    let started = Instant::now();
    oplog::begin_command(args);

    let mut child = git_command(cwd, args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| AppError::git_not_found(error.to_string()))?;

    let mut stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| AppError::new("GIT_FAILED", "无法打开 git stdout"))?;
    let stderr_pipe = child.stderr.take();

    let stderr_handle = thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = stderr_pipe {
            let mut chunk = [0_u8; 8_192];
            loop {
                match pipe.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => {
                        if buf.len() < CAPPED_STDERR_MAX_BYTES {
                            let room = CAPPED_STDERR_MAX_BYTES - buf.len();
                            buf.extend_from_slice(&chunk[..n.min(room)]);
                        }
                    }
                    Err(_) => break,
                }
            }
        }
        String::from_utf8_lossy(&buf).into_owned()
    });

    let mut out = Vec::with_capacity(max_stdout_bytes.min(64 * 1024));
    let mut chunk = [0_u8; 8_192];
    let mut truncated = false;
    loop {
        let n = match stdout_pipe.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        let remaining = max_stdout_bytes.saturating_sub(out.len());
        if remaining == 0 {
            truncated = true;
            break;
        }
        let take = n.min(remaining);
        out.extend_from_slice(&chunk[..take]);
        if take < n {
            truncated = true;
            break;
        }
    }

    if truncated {
        // 停止 git 继续吐数据，避免后台仍占用 CPU/内存
        let _ = child.kill();
    }
    let status = child.wait().map_err(|error| {
        AppError::new("GIT_FAILED", "等待 git 进程失败").with_details(error.to_string())
    })?;
    let stderr = stderr_handle.join().unwrap_or_default();
    let stdout = String::from_utf8_lossy(&out).into_owned();
    let code = status.code().unwrap_or(-1);

    let git_output = GitOutput {
        stdout: stdout.clone(),
        stderr: stderr.clone(),
        code,
    };
    record(args, &git_output, started);

    // 主动截断时 kill 可能导致非 0；有输出则仍视为成功
    if truncated {
        return Ok((stdout, true));
    }
    if code == 0 {
        return Ok((stdout, false));
    }
    // 未截断却失败：走统一错误语义
    Err(error_from_failed_output(
        args,
        GitOutput {
            stdout,
            stderr,
            code,
        },
    ))
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

/// 带超时且允许非 0 退出码（如 pull 冲突需自行判定）
pub fn run_git_timeout_allow_nonzero(
    cwd: &Path,
    args: &[&str],
    timeout: Duration,
) -> Result<GitOutput, AppError> {
    run_git_allow_nonzero_timeout(cwd, args, Some(timeout))
}

/// 将非 0 的 GitOutput 转为领域错误（与 run_git_timeout 失败路径一致）
pub fn error_from_failed_output(args: &[&str], output: GitOutput) -> AppError {
    match ensure_success(args, output) {
        Ok(_) => AppError::new("GIT_FAILED", "git 命令失败"),
        Err(error) => error,
    }
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

    // husky / git hook：优先抽出真正失败原因，避免只显示包装句
    if lower.contains("husky")
        || lower.contains("pre-commit")
        || lower.contains("pre-push")
        || lower.contains(".husky/")
    {
        let hook_name = if lower.contains("pre-push") {
            "pre-push"
        } else if lower.contains("pre-commit") {
            "pre-commit"
        } else {
            "hook"
        };
        // lint-staged「Task killed」：多为内存/进程被杀，不是缺 PATH
        if looks_like_lint_staged_task_killed(&combined) {
            return Err(AppError::new(
                "GIT_FAILED",
                format!(
                    "Git {hook_name} 检查未通过：格式化或检查任务被中断（Task killed）。请重试提交；若反复出现，请释放内存或减少一次暂存的文件数量"
                ),
            )
            .with_details(combined));
        }
        // cargo fmt --check：Rust 未按 rustfmt 格式化
        if looks_like_cargo_fmt_check_failure(&combined) {
            return Err(AppError::new(
                "GIT_FAILED",
                format!(
                    "Git {hook_name} 检查未通过：Rust 代码格式不符合 rustfmt。请运行 cargo fmt --manifest-path src-tauri/Cargo.toml 后再提交"
                ),
            )
            .with_details(combined));
        }
        let reason = pick_error_message(&combined)
            .map(|line| truncate_chars(&line, 180))
            .unwrap_or_else(|| "请根据仓库 hooks 输出排查（如 lint / 测试）".to_string());
        let mut message = format!("Git {hook_name} 检查未通过：{reason}");
        if looks_like_hook_toolchain_issue(&combined) {
            message.push_str("。可在设置 → 外部工具中配置额外 PATH（node 所在目录）");
        }
        return Err(AppError::new("GIT_FAILED", message).with_details(combined));
    }

    let message = pick_error_message(&combined).unwrap_or_else(|| "git 命令失败".to_string());
    Err(AppError::new("GIT_FAILED", message).with_details(combined))
}

/// 钩子失败是否像缺少 node 或 PATH 不对
fn looks_like_hook_toolchain_issue(combined: &str) -> bool {
    let lower = combined.to_ascii_lowercase();
    lower.contains("this version of pnpm requires")
        || lower.contains("pnpm: command not found")
        || lower.contains("'pnpm' is not recognized")
        || lower.contains("node: command not found")
        || lower.contains("'node' is not recognized")
        || lower.contains("enoent")
        || (lower.contains("unsupported engine") && lower.contains("node"))
        || (lower.contains("requires a node version") && lower.contains("pnpm"))
}

/// lint-staged 子任务被 SIGKILL / 内存杀掉
fn looks_like_lint_staged_task_killed(combined: &str) -> bool {
    combined.to_ascii_lowercase().contains("task killed")
}

fn looks_like_cargo_fmt_check_failure(combined: &str) -> bool {
    let lower = combined.to_ascii_lowercase();
    lower.contains("cargo fmt") && (lower.contains("diff in ") || lower.contains("--check"))
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

/// husky / npm 包装句：有「failed」但不是真正原因，挑错时应跳过
fn is_hook_wrapper_line(line: &str) -> bool {
    let lower = line.trim().to_lowercase();
    lower.starts_with("husky -")
        || lower.starts_with("husky:")
        || (lower.starts_with("husky") && lower.contains("failed"))
        || lower.starts_with("exit status")
        || lower.starts_with("npm error")
        || lower.contains("command failed with exit code")
        || lower.starts_with("error command failed")
        || lower.contains("script failed (code")
        || lower.starts_with("skipping backup because")
        || lower.contains("this might result in data loss")
}

fn looks_like_error_line(line: &str) -> bool {
    if is_hook_wrapper_line(line) {
        return false;
    }
    let lower = line.to_lowercase();
    // lint-staged 进度行：仅有命令名、无实质原因
    if lower.starts_with('✖') || lower.starts_with('✗') {
        let rest = lower.trim_start_matches(['✖', '✗', ' ']);
        if rest.starts_with("prettier ") && !rest.contains("task killed") {
            // 真正失败通常还有 Diff / 解析错误；单独一条 prettier 命令名优先不选
            if !rest.contains("error") && !rest.contains("diff") && rest.ends_with(':') {
                return false;
            }
        }
    }
    lower.contains("error")
        || lower.contains("fatal")
        || lower.contains("failed")
        || lower.contains("diff in ")
        || lower.contains("task killed")
        || lower.contains("✖")
        || lower.contains("✗")
        || lower.contains("subject-empty")
        || lower.contains("type-empty")
        || lower.contains("commitlint")
        || lower.contains("rejected")
        || lower.contains("eslint")
        || lower.contains("prettier")
        || lower.contains("lint-staged")
        || lower.contains("cargo fmt")
}

fn pick_error_message(text: &str) -> Option<String> {
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !is_decorative_line(line))
        .filter(|line| !is_hook_wrapper_line(line))
        .collect();

    if let Some(line) = lines.iter().rev().find(|line| looks_like_error_line(line)) {
        return Some((*line).to_string());
    }

    lines.last().map(|line| (*line).to_string())
}

fn truncate_chars(input: &str, max_chars: usize) -> String {
    let count = input.chars().count();
    if count <= max_chars {
        return input.to_string();
    }
    let mut out: String = input.chars().take(max_chars.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn run_git_allow_nonzero_timeout(
    cwd: &Path,
    args: &[&str],
    timeout: Option<Duration>,
) -> Result<GitOutput, AppError> {
    let started = Instant::now();

    if timeout.is_none() {
        oplog::begin_command(args);
        let output = git_command(cwd, args)
            .output()
            .map_err(|error| AppError::git_not_found(error.to_string()))?;

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
        .map_err(|error| AppError::git_not_found(error.to_string()))?;

    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();

    // push/pull 的 hook（如 husky pre-push → pnpm check）可能刷屏；限长并排空
    let stdout_handle = thread::spawn(move || {
        if let Some(pipe) = stdout_pipe {
            read_capped_and_drain(pipe, CAPPED_STDIN_STDOUT_MAX_BYTES)
        } else {
            String::new()
        }
    });
    let stderr_handle = thread::spawn(move || {
        if let Some(pipe) = stderr_pipe {
            read_capped_and_drain(pipe, CAPPED_STDIN_STDERR_MAX_BYTES)
        } else {
            String::new()
        }
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
    use super::{ensure_success, pick_error_message, strip_ansi, GitOutput};

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
            Some("✖   type may not be empty [type-empty]")
        );
    }

    #[test]
    fn skips_husky_wrapper_and_keeps_real_reason() {
        let text = "\
[STARTED] Backing up original state...
[COMPLETED] Running tasks for staged files...
✖ eslint found 2 problems
husky - pre-commit script failed (code 1)
";
        assert_eq!(
            pick_error_message(text).as_deref(),
            Some("✖ eslint found 2 problems")
        );
    }

    #[test]
    fn husky_failure_message_includes_reason() {
        let output = GitOutput {
            stdout: String::new(),
            stderr: "✖ eslint found problems\nhusky - pre-commit script failed (code 1)\n"
                .to_string(),
            code: 1,
        };
        let err = ensure_success(&["commit", "-F", "-"], output).unwrap_err();
        assert!(err.message.contains("pre-commit"));
        assert!(err.message.contains("eslint"));
        assert!(!err.message.contains("script failed (code 1)"));
    }

    #[test]
    fn husky_task_killed_gets_friendly_message() {
        let output = GitOutput {
            stdout: String::new(),
            stderr: "\
✖ Task killed: prettier --write --ignore-unknown
⚠ Skipping backup because `--no-stash` was used.
husky - pre-commit script failed (code 1)
"
            .to_string(),
            code: 1,
        };
        let err = ensure_success(&["commit", "-m", "x"], output).unwrap_err();
        assert!(err.message.contains("Task killed"));
        assert!(err.message.contains("释放内存") || err.message.contains("重试"));
        assert!(!err.message.contains("额外 PATH"));
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
