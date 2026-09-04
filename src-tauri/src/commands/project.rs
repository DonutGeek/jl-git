//! 项目与工作区 Command：薄壳，参数整形后交给 `services`，业务规则不在这里。

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::error::AppError;
use crate::git::path::{normalize_existing_dir, require_git_toplevel};
use crate::git::project_profile::{self, ProjectProfileSnapshot};
use crate::git::remote_identity::{canonicalize_remote_identity, require_remote_url};
use crate::models::project::{ProjectPatch, ProjectRow, RecentProjectItem};
use crate::models::workspace::{CatalogTreeNode, WorkspaceRow, WorkspaceTreeNode};
use crate::services;
use crate::state::AppState;

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
pub struct ProjectAddResult {
    project: ProjectRow,
    already_exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRemoteMatch {
    id: String,
    name: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUniquenessResult {
    /// `new` | `existingPath` | `existingRemote`
    kind: String,
    project: Option<ProjectRow>,
    matches: Vec<ProjectRemoteMatch>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeResult {
    tree: Vec<WorkspaceTreeNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCatalogTreeResult {
    tree: Vec<CatalogTreeNode>,
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
    state: State<'_, AppState>,
    workspace_id: Option<String>,
) -> Result<ProjectListResult, AppError> {
    let pool = state.pool().await?;
    let projects = services::project::list(&pool, workspace_id.as_deref()).await?;

    Ok(ProjectListResult { projects })
}

#[tauri::command]
pub async fn project_add(
    state: State<'_, AppState>,
    path: String,
    name: Option<String>,
    workspace_id: Option<String>,
    description: Option<String>,
    icon: Option<String>,
) -> Result<ProjectAddResult, AppError> {
    let pool = state.pool().await?;
    let (project, already_exists) =
        services::project::add(&pool, path, name, workspace_id, description, icon).await?;

    Ok(ProjectAddResult {
        project,
        already_exists,
    })
}

/// 本地路径或远程 URL 唯一性检查（远程命中只警告，不阻断）。
#[tauri::command]
pub async fn project_check_uniqueness(
    state: State<'_, AppState>,
    path: Option<String>,
    remote_url: Option<String>,
) -> Result<ProjectUniquenessResult, AppError> {
    let pool = state.pool().await?;
    let path = path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let remote_url = remote_url
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    match (path, remote_url) {
        (Some(path), None) => {
            let repo_path = require_git_toplevel(&normalize_existing_dir(&path)?)?;
            let path_key = repo_path.to_string_lossy().into_owned();
            let projects = services::project::list(&pool, None).await?;
            if let Some(project) = projects.into_iter().find(|item| item.path == path_key) {
                return Ok(ProjectUniquenessResult {
                    kind: "existingPath".into(),
                    project: Some(project),
                    matches: vec![],
                });
            }
            Ok(ProjectUniquenessResult {
                kind: "new".into(),
                project: None,
                matches: vec![],
            })
        }
        (None, Some(remote_url)) => {
            require_remote_url(&remote_url)?;
            let Some(target) = canonicalize_remote_identity(&remote_url) else {
                // 无法规范化则跳过远程重复提示
                return Ok(ProjectUniquenessResult {
                    kind: "new".into(),
                    project: None,
                    matches: vec![],
                });
            };

            let projects = services::project::list(&pool, None).await?;
            let mut matches = Vec::new();
            for project in projects {
                let Some(url) = project
                    .remote_url
                    .as_deref()
                    .filter(|item| !item.is_empty())
                else {
                    continue;
                };
                let Some(identity) = canonicalize_remote_identity(url) else {
                    continue;
                };
                if identity == target {
                    matches.push(ProjectRemoteMatch {
                        id: project.id,
                        name: project.name,
                        path: project.path,
                    });
                }
            }

            if matches.is_empty() {
                Ok(ProjectUniquenessResult {
                    kind: "new".into(),
                    project: None,
                    matches: vec![],
                })
            } else {
                Ok(ProjectUniquenessResult {
                    kind: "existingRemote".into(),
                    project: None,
                    matches,
                })
            }
        }
        _ => Err(AppError::new(
            "VALIDATION",
            "请提供本地路径或远程仓库地址之一",
        )),
    }
}

#[tauri::command]
pub async fn project_touch_opened(
    state: State<'_, AppState>,
    id: String,
) -> Result<OkResult, AppError> {
    let pool = state.pool().await?;
    services::project::touch_opened(&pool, &id).await?;

    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn project_remove(
    state: State<'_, AppState>,
    id: String,
) -> Result<OkResult, AppError> {
    let pool = state.pool().await?;
    services::project::remove(&pool, &id).await?;

    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn project_update(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    workspace_id: Option<Option<String>>,
    description: Option<Option<String>>,
    icon: Option<String>,
    path: Option<String>,
    allow_remote_mismatch: Option<bool>,
) -> Result<ProjectResult, AppError> {
    let pool = state.pool().await?;
    let project = services::project::update(
        &pool,
        &id,
        ProjectPatch {
            name,
            workspace_id,
            description,
            icon,
            path,
            allow_remote_mismatch: allow_remote_mismatch.unwrap_or(false),
        },
    )
    .await?;

    Ok(ProjectResult { project })
}

/// 收集仓库根 README / 清单文件，供 AI 生成项目简介
#[tauri::command]
pub fn project_profile_snapshot(path: String) -> Result<ProjectProfileSnapshot, AppError> {
    project_profile::collect_snapshot(&path)
}

#[tauri::command]
pub async fn workspace_list(
    state: State<'_, AppState>,
) -> Result<WorkspaceListResult, AppError> {
    let pool = state.pool().await?;
    Ok(WorkspaceListResult {
        workspaces: services::workspace::list(&pool).await?,
    })
}

/// 分组树；编辑上级时传 `excludeId` 排除自身及子孙
#[tauri::command]
pub async fn workspace_tree(
    state: State<'_, AppState>,
    exclude_id: Option<String>,
) -> Result<WorkspaceTreeResult, AppError> {
    let pool = state.pool().await?;
    let workspaces = services::workspace::list(&pool).await?;
    let exclude_id = exclude_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    Ok(WorkspaceTreeResult {
        tree: services::workspace::build_tree(&workspaces, exclude_id),
    })
}

/// 仪表盘分组/仓库混排树；`query` 只过滤仓库
#[tauri::command]
pub async fn project_catalog_tree(
    state: State<'_, AppState>,
    query: Option<String>,
) -> Result<ProjectCatalogTreeResult, AppError> {
    let pool = state.pool().await?;
    let workspaces = services::workspace::list(&pool).await?;
    let projects = services::project::list(&pool, None).await?;
    let query = query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    Ok(ProjectCatalogTreeResult {
        tree: services::workspace::build_catalog_tree(&workspaces, &projects, query),
    })
}

#[tauri::command]
pub async fn workspace_create(
    state: State<'_, AppState>,
    name: String,
    parent_id: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<WorkspaceResult, AppError> {
    let pool = state.pool().await?;
    Ok(WorkspaceResult {
        workspace: services::workspace::create(&pool, name, parent_id, icon, color).await?,
    })
}

#[tauri::command]
pub async fn workspace_update(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    parent_id: Option<Option<String>>,
    icon: Option<String>,
    color: Option<String>,
    locked: Option<bool>,
) -> Result<WorkspaceResult, AppError> {
    let pool = state.pool().await?;
    Ok(WorkspaceResult {
        workspace: services::workspace::update(
            &pool,
            &id,
            crate::models::workspace::WorkspacePatch {
                name,
                parent_id,
                icon,
                color,
                locked,
            },
        )
        .await?,
    })
}

#[tauri::command]
pub async fn workspace_delete(
    state: State<'_, AppState>,
    id: String,
) -> Result<OkResult, AppError> {
    let pool = state.pool().await?;
    services::workspace::delete(&pool, &id).await?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn workspace_reorder(
    state: State<'_, AppState>,
    workspaces: Vec<WorkspaceOrderItem>,
    projects: Vec<ProjectOrderItem>,
) -> Result<OkResult, AppError> {
    let pool = state.pool().await?;
    services::project::reorder(
        &pool,
        workspaces
            .into_iter()
            .map(|item| crate::models::project::WorkspaceOrderItem {
                id: item.id,
                sort_order: item.sort_order,
            })
            .collect(),
        projects
            .into_iter()
            .map(|item| crate::models::project::ProjectOrderItem {
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
pub async fn recent_remove(
    state: State<'_, AppState>,
    id: String,
) -> Result<OkResult, AppError> {
    let pool = state.pool().await?;
    services::project::remove_recent(&pool, &id).await?;

    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn recent_list(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<RecentListResult, AppError> {
    let pool = state.pool().await?;
    let items = services::project::list_recent(&pool, limit).await?;

    Ok(RecentListResult { items })
}
