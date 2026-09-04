//! 应用数据 Command：薄壳，业务规则在 `services::app_data`。

use serde::Deserialize;
use tauri::{AppHandle, Manager, State};

use crate::error::AppError;
use crate::models::app_data::{AppDataPaths, AppDataUsage};
use crate::services;
use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevealInput {
    target: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearInput {
    module: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResult {
    ok: bool,
}

fn app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    app.path().app_data_dir().map_err(|error| {
        AppError::new("INTERNAL", "无法解析应用数据目录").with_details(error.to_string())
    })
}

#[tauri::command]
pub async fn app_data_paths(app: AppHandle) -> Result<AppDataPaths, AppError> {
    let dir = app_data_dir(&app)?;
    Ok(services::app_data::resolve_paths(&dir))
}

#[tauri::command]
pub async fn app_data_usage(app: AppHandle) -> Result<AppDataUsage, AppError> {
    let dir = app_data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || services::app_data::measure_usage(&dir))
        .await
        .map_err(|error| {
            AppError::new("INTERNAL", "统计应用数据目录失败").with_details(error.to_string())
        })?
}

#[tauri::command]
pub async fn app_data_reveal(app: AppHandle, input: RevealInput) -> Result<OkResult, AppError> {
    let dir = app_data_dir(&app)?;
    services::app_data::reveal_target(&dir, input.target.trim())?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn app_data_clear(
    app: AppHandle,
    state: State<'_, AppState>,
    input: ClearInput,
) -> Result<OkResult, AppError> {
    let dir = app_data_dir(&app)?;
    let pool = state.pool().await?;
    services::app_data::clear_module(&pool, &dir, input.module.trim()).await?;
    Ok(OkResult { ok: true })
}

/// 备份导出依赖 SQLite `VACUUM INTO`，切换 PostgreSQL 后本阶段下线。
/// 保留 Command 以便旧调用方拿到明确报错，而不是「命令不存在」。
#[tauri::command]
pub async fn app_data_export() -> Result<OkResult, AppError> {
    Err(services::app_data::backup_unsupported())
}

/// 备份导入同上：恢复需要用 `pg_restore`，而非替换本地库文件。
#[tauri::command]
pub async fn app_data_import() -> Result<OkResult, AppError> {
    Err(services::app_data::backup_unsupported())
}
