use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::{self, ProjectRow, RecentProjectItem, WorkspaceRow};
use crate::error::AppError;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListResult {
    projects: Vec<ProjectRow>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectResult {
    project: ProjectRow,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResult {
    ok: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickDirectoryResult {
    path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentListResult {
    items: Vec<RecentProjectItem>,
}
#[derive(Serialize)] #[serde(rename_all = "camelCase")] pub struct WorkspaceListResult { workspaces: Vec<WorkspaceRow> }
#[derive(Serialize)] #[serde(rename_all = "camelCase")] pub struct WorkspaceResult { workspace: WorkspaceRow }

#[tauri::command]
pub async fn project_list(
    pool: State<'_, SqlitePool>,
    workspace_id: Option<String>,
) -> Result<ProjectListResult, AppError> {
    let projects = db::list_projects(&pool, workspace_id.as_deref()).await?;

    Ok(ProjectListResult { projects })
}

#[tauri::command]
pub async fn project_add(
    pool: State<'_, SqlitePool>,
    path: String,
    name: Option<String>,
    workspace_id: Option<String>,
) -> Result<ProjectResult, AppError> {
    let project = db::add_project(&pool, path, name, workspace_id).await?;

    Ok(ProjectResult { project })
}

#[tauri::command]
pub async fn project_touch_opened(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<OkResult, AppError> {
    db::touch_opened(&pool, &id).await?;

    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn project_remove(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<OkResult, AppError> {
    db::remove_project(&pool, &id).await?;

    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn project_update(
    pool: State<'_, SqlitePool>,
    id: String,
    name: Option<String>,
    workspace_id: Option<Option<String>>,
) -> Result<ProjectResult, AppError> {
    let project = db::update_project(&pool, &id, name, workspace_id).await?;

    Ok(ProjectResult { project })
}
#[tauri::command] pub async fn workspace_list(pool: State<'_, SqlitePool>) -> Result<WorkspaceListResult, AppError> { Ok(WorkspaceListResult { workspaces: db::list_workspaces(&pool).await? }) }
#[tauri::command] pub async fn workspace_create(pool: State<'_, SqlitePool>, name: String) -> Result<WorkspaceResult, AppError> { Ok(WorkspaceResult { workspace: db::create_workspace(&pool, name).await? }) }
#[tauri::command] pub async fn workspace_delete(pool: State<'_, SqlitePool>, id: String) -> Result<OkResult, AppError> { db::delete_workspace(&pool, &id).await?; Ok(OkResult { ok: true }) }

#[tauri::command]
pub async fn project_pick_directory(app: AppHandle) -> Result<PickDirectoryResult, AppError> {
    let path = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .map(|path| {
            path.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|error| {
                    AppError::new("INTERNAL", "无法读取选择目录").with_details(error.to_string())
                })
        })
        .transpose()?;

    Ok(PickDirectoryResult { path })
}

#[tauri::command]
pub async fn recent_list(
    pool: State<'_, SqlitePool>,
    limit: Option<u32>,
) -> Result<RecentListResult, AppError> {
    let items = db::list_recent(&pool, limit).await?;

    Ok(RecentListResult { items })
}
