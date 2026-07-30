use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::{self, ProjectRow, RecentProjectItem, WorkspaceRow};
use crate::error::AppError;
use crate::git::project_profile::{self, ProjectProfileSnapshot};

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
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceListResult {
    workspaces: Vec<WorkspaceRow>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResult {
    workspace: WorkspaceRow,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOrderItem {
    id: String,
    sort_order: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOrderItem {
    id: String,
    workspace_id: Option<String>,
    sort_order: i64,
}

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
    description: Option<String>,
    icon: Option<String>,
) -> Result<ProjectResult, AppError> {
    let project = db::add_project(&pool, path, name, workspace_id, description, icon).await?;

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
pub async fn project_remove(pool: State<'_, SqlitePool>, id: String) -> Result<OkResult, AppError> {
    db::remove_project(&pool, &id).await?;

    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn project_update(
    pool: State<'_, SqlitePool>,
    id: String,
    name: Option<String>,
    workspace_id: Option<Option<String>>,
    description: Option<Option<String>>,
    icon: Option<String>,
) -> Result<ProjectResult, AppError> {
    let project = db::update_project(&pool, &id, name, workspace_id, description, icon).await?;

    Ok(ProjectResult { project })
}

/// 收集仓库根 README / 清单文件，供 AI 生成项目简介
#[tauri::command]
pub fn project_profile_snapshot(path: String) -> Result<ProjectProfileSnapshot, AppError> {
    project_profile::collect_snapshot(&path)
}
#[tauri::command]
pub async fn workspace_list(pool: State<'_, SqlitePool>) -> Result<WorkspaceListResult, AppError> {
    Ok(WorkspaceListResult {
        workspaces: db::list_workspaces(&pool).await?,
    })
}
#[tauri::command]
pub async fn workspace_create(
    pool: State<'_, SqlitePool>,
    name: String,
    parent_id: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<WorkspaceResult, AppError> {
    Ok(WorkspaceResult {
        workspace: db::create_workspace(&pool, name, parent_id, icon, color).await?,
    })
}
#[tauri::command]
pub async fn workspace_update(
    pool: State<'_, SqlitePool>,
    id: String,
    name: Option<String>,
    parent_id: Option<Option<String>>,
    icon: Option<String>,
    color: Option<String>,
    locked: Option<bool>,
) -> Result<WorkspaceResult, AppError> {
    Ok(WorkspaceResult {
        workspace: db::update_workspace(&pool, &id, name, parent_id, icon, color, locked).await?,
    })
}
#[tauri::command]
pub async fn workspace_delete(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<OkResult, AppError> {
    db::delete_workspace(&pool, &id).await?;
    Ok(OkResult { ok: true })
}
#[tauri::command]
pub async fn workspace_reorder(
    pool: State<'_, SqlitePool>,
    workspaces: Vec<WorkspaceOrderItem>,
    projects: Vec<ProjectOrderItem>,
) -> Result<OkResult, AppError> {
    db::reorder_projects_and_workspaces(
        &pool,
        workspaces
            .into_iter()
            .map(|item| db::WorkspaceOrderItem {
                id: item.id,
                sort_order: item.sort_order,
            })
            .collect(),
        projects
            .into_iter()
            .map(|item| db::ProjectOrderItem {
                id: item.id,
                workspace_id: item.workspace_id,
                sort_order: item.sort_order,
            })
            .collect(),
    )
    .await?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn project_pick_directory(app: AppHandle) -> Result<PickDirectoryResult, AppError> {
    // 非阻塞拉起面板（主线程），再用 spawn_blocking 等待结果，避免卡住 async runtime
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });

    let folder = tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|error| {
            AppError::new("INTERNAL", "选择目录任务失败").with_details(error.to_string())
        })?
        .map_err(|_| AppError::new("INTERNAL", "选择目录对话已中断"))?;

    let path = folder
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
