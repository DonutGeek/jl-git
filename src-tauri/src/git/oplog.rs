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
    if text.chars().count() <= MAX_OUTPUT_CHARS {
        return text.to_string();
    }
    let truncated: String = text.chars().take(MAX_OUTPUT_CHARS).collect();
    format!("{truncated}\n…(输出已截断)")
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
        Err(err) => (false, Some(err.message.clone())),
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
                args: args.iter().map(|s| (*s).to_string()).collect(),
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
                args: args.iter().map(|s| (*s).to_string()).collect(),
                stdout: truncate_output(stdout),
                stderr: truncate_output(stderr),
                code,
                elapsed_ms,
                started_at: now_clock(),
            },
        );
    });
}
