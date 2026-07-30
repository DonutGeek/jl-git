use std::cell::RefCell;
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::error::AppError;

const EVENT: &str = "jlgit://git-op";
const MAX_OUTPUT_CHARS: usize = 32_768;

thread_local! {
    static CURRENT: RefCell<Option<OpContext>> = const { RefCell::new(None) };
}

struct OpContext {
    app: AppHandle,
    op_id: String,
    repo_path: String,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitOpEvent {
    #[serde(rename_all = "camelCase")]
    Start {
        op_id: String,
        repo_path: String,
        label: String,
        started_at: String,
    },
    /// 单条 git 即将开始（便于前端实时显示「开始: …」）
    #[serde(rename_all = "camelCase")]
    CmdStart {
        op_id: String,
        repo_path: String,
        args: Vec<String>,
        started_at: String,
    },
    #[serde(rename_all = "camelCase")]
    Cmd {
        op_id: String,
        repo_path: String,
        args: Vec<String>,
        stdout: String,
        stderr: String,
        code: i32,
        elapsed_ms: u64,
        started_at: String,
    },
    #[serde(rename_all = "camelCase")]
    End {
        op_id: String,
        repo_path: String,
        label: String,
        ok: bool,
        elapsed_ms: u64,
        error: Option<String>,
    },
}

fn now_clock() -> String {
    chrono::Local::now().format("%H:%M:%S").to_string()
}

fn truncate_output(text: &str) -> String {
    let text = redact_sensitive_text(text);
    if text.chars().count() <= MAX_OUTPUT_CHARS {
        return text;
    }
    let truncated: String = text.chars().take(MAX_OUTPUT_CHARS).collect();
    format!("{truncated}\n…(输出已截断)")
}

fn is_sensitive_key(key: &str) -> bool {
    matches!(
        key.trim().to_ascii_lowercase().as_str(),
        "token"
            | "access_token"
            | "auth"
            | "authorization"
            | "password"
            | "passwd"
            | "secret"
            | "api_key"
            | "apikey"
    )
}

fn redact_url(input: &str) -> String {
    let Some(scheme_index) = input.find("://") else {
        return input.to_string();
    };
    let authority_start = scheme_index + 3;
    let authority_end = input[authority_start..]
        .find(['/', '?', '#', ' ', '\t', '\r', '\n'])
        .map(|offset| authority_start + offset)
        .unwrap_or(input.len());

    let mut redacted = if let Some(at_offset) = input[authority_start..authority_end].rfind('@') {
        let at = authority_start + at_offset;
        format!("{}***{}", &input[..authority_start], &input[at..])
    } else {
        input.to_string()
    };

    let Some(query_start) = redacted.find('?') else {
        return redacted;
    };
    let query_end = redacted[query_start + 1..]
        .find('#')
        .map(|offset| query_start + 1 + offset)
        .unwrap_or(redacted.len());
    let query = &redacted[query_start + 1..query_end];
    let sanitized = query
        .split('&')
        .map(|pair| {
            let Some((key, _)) = pair.split_once('=') else {
                return pair.to_string();
            };
            if is_sensitive_key(key) {
                format!("{key}=***")
            } else {
                pair.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("&");
    redacted.replace_range(query_start + 1..query_end, &sanitized);
    redacted
}

fn redact_arg(arg: &str) -> String {
    let lower = arg.to_ascii_lowercase();
    if lower.contains("authorization:")
        || lower.starts_with("http.extraheader=")
        || lower.starts_with("credential.")
        || lower.starts_with("core.askpass=")
    {
        return "[REDACTED]".to_string();
    }
    redact_url(arg)
}

fn redact_args(args: &[&str]) -> Vec<String> {
    args.iter().map(|arg| redact_arg(arg)).collect()
}

fn redact_sensitive_token(token: &str) -> String {
    let redacted = redact_url(token);
    let Some((key, _)) = redacted.split_once('=') else {
        return redacted;
    };
    let normalized_key = key
        .trim_matches(|character: char| {
            character.is_ascii_punctuation() && character != '_' && character != '-'
        })
        .trim_start_matches('-');
    if is_sensitive_key(normalized_key) {
        return format!("{key}=***");
    }
    redacted
}

fn redact_sensitive_line(line: &str) -> String {
    let (content, line_ending) = line
        .strip_suffix('\n')
        .map_or((line, ""), |content| (content, "\n"));
    let lower = content.to_ascii_lowercase();
    for marker in [
        "authorization:",
        "password:",
        "passwd:",
        "access_token:",
        "api_key:",
    ] {
        if let Some(index) = lower.find(marker) {
            return format!(
                "{}{} ***{line_ending}",
                &content[..index],
                &content[index..index + marker.len()]
            );
        }
    }
    content
        .split_inclusive(char::is_whitespace)
        .map(redact_sensitive_token)
        .collect::<String>()
        + line_ending
}

pub(crate) fn redact_sensitive_text(text: &str) -> String {
    text.split_inclusive('\n')
        .map(redact_sensitive_line)
        .collect()
}

fn emit(app: &AppHandle, event: &GitOpEvent) {
    let _ = app.emit(EVENT, event);
}

/// 在闭包期间启用操作日志；runner 内的 git 调用会挂到该操作下
/// `repo_key` 使用前端传入的路径，便于与 Store.repoPath 对齐
pub fn run_logged<T>(
    app: &AppHandle,
    repo_key: &str,
    label: &str,
    f: impl FnOnce() -> Result<T, AppError>,
) -> Result<T, AppError> {
    let op_id = Uuid::new_v4().to_string();
    let repo = repo_key.to_string();
    let started = Instant::now();

    emit(
        app,
        &GitOpEvent::Start {
            op_id: op_id.clone(),
            repo_path: repo.clone(),
            label: label.to_string(),
            started_at: now_clock(),
        },
    );

    CURRENT.with(|cell| {
        *cell.borrow_mut() = Some(OpContext {
            app: app.clone(),
            op_id: op_id.clone(),
            repo_path: repo.clone(),
        });
    });

    let result = f();

    let elapsed_ms = started.elapsed().as_millis() as u64;
    let (ok, error) = match &result {
        Ok(_) => (true, None),
        Err(err) => (false, Some(redact_sensitive_text(&err.message))),
    };

    emit(
        app,
        &GitOpEvent::End {
            op_id,
            repo_path: repo,
            label: label.to_string(),
            ok,
            elapsed_ms,
            error,
        },
    );

    CURRENT.with(|cell| {
        *cell.borrow_mut() = None;
    });

    result
}

/// 由 runner 在每次 git 开始前调用（无活动操作时为 no-op）
pub fn begin_command(args: &[&str]) {
    CURRENT.with(|cell| {
        let binding = cell.borrow();
        let Some(ctx) = binding.as_ref() else {
            return;
        };

        emit(
            &ctx.app,
            &GitOpEvent::CmdStart {
                op_id: ctx.op_id.clone(),
                repo_path: ctx.repo_path.clone(),
                args: redact_args(args),
                started_at: now_clock(),
            },
        );
    });
}

/// 由 runner 在每次 git 结束后调用（无活动操作时为 no-op）
pub fn record_command(args: &[&str], stdout: &str, stderr: &str, code: i32, elapsed_ms: u64) {
    CURRENT.with(|cell| {
        let binding = cell.borrow();
        let Some(ctx) = binding.as_ref() else {
            return;
        };

        emit(
            &ctx.app,
            &GitOpEvent::Cmd {
                op_id: ctx.op_id.clone(),
                repo_path: ctx.repo_path.clone(),
                args: redact_args(args),
                stdout: truncate_output(stdout),
                stderr: truncate_output(stderr),
                code,
                elapsed_ms,
                started_at: now_clock(),
            },
        );
    });
}

#[cfg(test)]
mod tests {
    use super::{redact_arg, redact_sensitive_text};

    #[test]
    fn redacts_credentials_and_sensitive_query_values() {
        assert_eq!(
            redact_arg("https://user:token@example.com/repo.git?access_token=abc&depth=1"),
            "https://***@example.com/repo.git?access_token=***&depth=1"
        );
    }

    #[test]
    fn redacts_urls_embedded_in_git_output() {
        let output = "fatal: unable to access 'https://user:secret@example.com/repo.git/'";
        let redacted = redact_sensitive_text(output);
        assert!(!redacted.contains("secret"));
        assert!(redacted.contains("https://***@example.com"));
    }

    #[test]
    fn redacts_authorization_config_arguments() {
        assert_eq!(
            redact_arg("http.extraHeader=Authorization: Bearer secret"),
            "[REDACTED]"
        );
    }

    #[test]
    fn redacts_sensitive_headers_and_plain_key_values() {
        let output = "\
remote: Authorization: Bearer top-secret
token=abc password=hunter2 harmless=value
";
        let redacted = redact_sensitive_text(output);
        assert!(!redacted.contains("top-secret"));
        assert!(!redacted.contains("hunter2"));
        assert!(!redacted.contains("token=abc"));
        assert!(redacted.contains("token=***"));
        assert!(redacted.contains("harmless=value"));
    }
}
