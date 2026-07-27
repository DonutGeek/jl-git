use serde::Deserialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};

use crate::db::{self, AppDataExportInput, AppDataImportResult, AppDataPaths, AppDataUsage};
use crate::error::AppError;

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInput {
    source_path: String,
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
    Ok(db::resolve_paths(&dir))
}

#[tauri::command]
pub async fn app_data_usage(app: AppHandle) -> Result<AppDataUsage, AppError> {
    let dir = app_data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || db::measure_usage(&dir))
        .await
        .map_err(|error| {
            AppError::new("INTERNAL", "统计应用数据目录失败").with_details(error.to_string())
        })?
}

#[tauri::command]
pub async fn app_data_reveal(app: AppHandle, input: RevealInput) -> Result<OkResult, AppError> {
    let dir = app_data_dir(&app)?;
    db::reveal_target(&dir, input.target.trim())?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn app_data_clear(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    input: ClearInput,
) -> Result<OkResult, AppError> {
    let dir = app_data_dir(&app)?;
    db::clear_module(&pool, &dir, input.module.trim()).await?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn app_data_export(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    input: AppDataExportInput,
) -> Result<OkResult, AppError> {
    let dir = app_data_dir(&app)?;
    db::export_backup(&pool, &dir, input).await?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn app_data_import(
    app: AppHandle,
    input: ImportInput,
) -> Result<AppDataImportResult, AppError> {
    let dir = app_data_dir(&app)?;
    db::import_backup(&dir, &input.source_path)
}
