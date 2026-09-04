//! 项目登记业务规则：路径规范化、唯一性、远端身份比对、分组锁定保护。

use std::path::{Path, PathBuf};

use sqlx::PgPool;

use crate::error::AppError;
use crate::git::path::{normalize_existing_dir, require_git_toplevel};
use crate::git::remote::{list_remotes, pick_primary_remote_url};
use crate::git::remote_identity::canonicalize_remote_identity;
use crate::models::project::{ProjectOrderItem, ProjectPatch, ProjectRow, WorkspaceOrderItem};
use crate::models::project::RecentProjectItem;
use crate::repositories::{self, is_unique_violation, now};
use crate::services::workspace::normalize_icon_name;

/// 登记本地仓库。路径已存在时返回已有项目且 `already_exists = true`，不覆盖任何字段。
pub async fn add(
    pool: &PgPool,
    path: String,
    name: Option<String>,
    workspace_id: Option<String>,
    description: Option<String>,
    icon: Option<String>,
) -> Result<(ProjectRow, bool), AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let path_key = path_to_string(&repo_path);

    let mut tx = pool.begin().await?;

    if let Some(existing) = repositories::project::find_by_path(&mut *tx, &path_key).await? {
        tx.commit().await?;
        return Ok((existing, true));
    }

    // 仅新建路径才校验展示字段与目标分组锁定
    let display_name = resolve_project_name(&repo_path, name)?;
    let description = normalize_description(description);
    let icon = normalize_optional_icon(icon)?;
    let timestamp = now();
    let id = uuid::Uuid::new_v4().to_string();
    ensure_workspace_unlocked_for_move(pool, workspace_id.as_deref(), "移入").await?;
    // 可读时写入 URL 或空串（标记已探测）；Git 失败则保持 NULL，列表加载时再补
    let remote_url = primary_remote_url_for_storage(&path_key);

    let insert = repositories::project::insert(
        &mut *tx,
        &id,
        workspace_id.as_deref(),
        &display_name,
        description.as_deref(),
        &icon,
        &path_key,
        remote_url.as_deref(),
        &timestamp,
    )
    .await;

    match insert {
        Ok(()) => {}
        Err(error) if is_unique_violation(&error) => {
            let existing = repositories::project::find_by_path(&mut *tx, &path_key)
                .await?
                .ok_or_else(|| AppError::new("NOT_FOUND", "项目不存在"))?;
            tx.commit().await?;
            return Ok((existing, true));
        }
        Err(error) => return Err(error.into()),
    }

    tx.commit().await?;
    Ok((
        repositories::project::get_by_path(pool, &path_key).await?,
        false,
    ))
}

pub async fn list(
    pool: &PgPool,
    workspace_id: Option<&str>,
) -> Result<Vec<ProjectRow>, AppError> {
    let mut projects = repositories::project::list(pool, workspace_id).await?;
    backfill_missing_remote_urls(pool, &mut projects).await?;
    Ok(projects)
}

pub async fn remove(pool: &PgPool, id: &str) -> Result<(), AppError> {
    require_id(id, "项目 ID 不能为空")?;
    if repositories::project::delete(pool, id).await? == 0 {
        return Err(AppError::new("NOT_FOUND", "项目不存在"));
    }
    Ok(())
}

pub async fn update(
    pool: &PgPool,
    id: &str,
    patch: ProjectPatch,
) -> Result<ProjectRow, AppError> {
    require_id(id, "项目 ID 不能为空")?;

    let name = patch
        .name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let description = patch.description.map(normalize_description);
    let icon = patch
        .icon
        .map(|value| normalize_optional_icon(Some(value)))
        .transpose()?;
    let next_path =
        resolve_path_update(pool, id, patch.path, patch.allow_remote_mismatch).await?;
    if name.is_none()
        && patch.workspace_id.is_none()
        && description.is_none()
        && icon.is_none()
        && next_path.is_none()
    {
        return Err(AppError::new("VALIDATION", "没有可更新的项目字段"));
    }

    if let Some(next_workspace_id) = patch.workspace_id.as_ref() {
        let current_workspace_id = repositories::project::workspace_id_of(pool, id)
            .await?
            .flatten();
        if current_workspace_id.as_ref() != next_workspace_id.as_ref() {
            ensure_workspace_unlocked_for_move(pool, current_workspace_id.as_deref(), "移出")
                .await?;
            ensure_workspace_unlocked_for_move(pool, next_workspace_id.as_deref(), "移入").await?;
        }
    }

    let next_remote_url = next_path
        .as_deref()
        .and_then(primary_remote_url_for_storage);
    let workspace_id = patch.workspace_id.clone().flatten();
    let description_value = description.clone().flatten();
    let result = repositories::project::update_fields(
        pool,
        id,
        name.as_deref(),
        patch.workspace_id.is_some(),
        workspace_id.as_deref(),
        description.is_some(),
        description_value.as_deref(),
        icon.as_deref(),
        next_path.as_deref(),
        next_remote_url.as_deref(),
        &now(),
    )
    .await;

    match result {
        Ok(0) => return Err(AppError::new("NOT_FOUND", "项目不存在")),
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(AppError::new("ALREADY_EXISTS", "该路径已登记为其他仓库"));
        }
        Err(error) => return Err(error.into()),
    }

    repositories::project::get_by_id(pool, id).await
}

/// 记录打开：更新项目时间、写入最近列表并裁剪到上限。
pub async fn touch_opened(pool: &PgPool, id: &str) -> Result<(), AppError> {
    require_id(id, "项目 ID 不能为空")?;

    let path = repositories::project::path_of(pool, id)
        .await?
        .ok_or_else(|| AppError::new("NOT_FOUND", "项目不存在"))?;
    let remote_url = primary_remote_url_for_storage(&path);
    let timestamp = now();

    let mut tx = pool.begin().await?;
    let affected =
        repositories::project::touch_opened(&mut *tx, id, &timestamp, remote_url.as_deref())
            .await?;
    if affected == 0 {
        return Err(AppError::new("NOT_FOUND", "项目不存在"));
    }
    repositories::recent::upsert(&mut *tx, id, &timestamp).await?;
    repositories::recent::prune(&mut *tx).await?;
    tx.commit().await?;

    Ok(())
}

pub async fn list_recent(
    pool: &PgPool,
    limit: Option<u32>,
) -> Result<Vec<RecentProjectItem>, AppError> {
    let limit = limit.unwrap_or(20).clamp(1, 100);
    repositories::recent::list(pool, i64::from(limit)).await
}

pub async fn remove_recent(pool: &PgPool, id: &str) -> Result<(), AppError> {
    require_id(id, "项目 ID 不能为空")?;
    repositories::recent::delete(pool, id).await
}

/// 分组与仓库混排重排：先整体校验，再写入，保证失败时事务整体回滚。
pub async fn reorder(
    pool: &PgPool,
    workspaces: Vec<WorkspaceOrderItem>,
    projects: Vec<ProjectOrderItem>,
) -> Result<(), AppError> {
    let timestamp = now();
    let mut tx = pool.begin().await?;

    for workspace in &workspaces {
        if !repositories::workspace::exists(&mut *tx, &workspace.id).await? {
            return Err(AppError::new("NOT_FOUND", "分组不存在"));
        }
    }
    for project in &projects {
        if !repositories::project::exists(&mut *tx, &project.id).await? {
            return Err(AppError::new("NOT_FOUND", "项目不存在"));
        }
        let current_workspace_id = repositories::project::workspace_id_of(&mut *tx, &project.id)
            .await?
            .flatten();
        if current_workspace_id != project.workspace_id {
            if let Some(source_id) = current_workspace_id.as_deref() {
                if repositories::workspace::is_locked(&mut *tx, source_id).await? {
                    return Err(AppError::new("VALIDATION", "锁定的分组不能移出仓库"));
                }
            }
            if let Some(target_id) = project.workspace_id.as_deref() {
                if repositories::workspace::is_locked(&mut *tx, target_id).await? {
                    return Err(AppError::new("VALIDATION", "锁定的分组不能移入仓库"));
                }
            }
        }
        if let Some(workspace_id) = project.workspace_id.as_deref() {
            if !repositories::workspace::exists(&mut *tx, workspace_id).await? {
                return Err(AppError::new("NOT_FOUND", "目标分组不存在"));
            }
        }
    }

    for workspace in workspaces {
        repositories::workspace::set_sort_order(
            &mut *tx,
            &workspace.id,
            workspace.sort_order,
            &timestamp,
        )
        .await?;
    }
    for project in projects {
        repositories::project::set_sort_order(
            &mut *tx,
            &project.id,
            project.workspace_id.as_deref(),
            project.sort_order,
            &timestamp,
        )
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

/// 解析改路径：规范化 Git 顶层、查重、与旧路径比对主远端身份。
async fn resolve_path_update(
    pool: &PgPool,
    id: &str,
    path: Option<String>,
    allow_remote_mismatch: bool,
) -> Result<Option<String>, AppError> {
    let Some(path) = path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    let current = repositories::project::get_by_id(pool, id).await?;
    let repo_path = resolve_repo_path(&path)?;
    let path_key = path_to_string(&repo_path);
    if path_key == current.path {
        return Ok(None);
    }

    if let Some(other) = repositories::project::find_by_path(pool, &path_key).await? {
        if other.id != id {
            return Err(AppError::new("ALREADY_EXISTS", "该路径已登记为其他仓库"));
        }
    }

    match compare_primary_remote_identity(&current.path, &path_key) {
        RemotePathCompare::Compatible => {}
        RemotePathCompare::Mismatch if allow_remote_mismatch => {}
        RemotePathCompare::Mismatch => {
            return Err(AppError::new(
                "REMOTE_MISMATCH",
                "新路径的 Git 远程与当前登记仓库不一致",
            ));
        }
    }

    Ok(Some(path_key))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RemotePathCompare {
    /// 旧路径不可读、两端均无远端、或主远端身份一致
    Compatible,
    /// 两端均可读且主远端身份不一致（含一侧有远端一侧无）
    Mismatch,
}

fn primary_remote_identity(repo_path: &str) -> Result<Option<String>, AppError> {
    let remotes = list_remotes(Path::new(repo_path))?;
    let Some(url) = pick_primary_remote_url(&remotes) else {
        return Ok(None);
    };
    Ok(canonicalize_remote_identity(&url))
}

/// 可读时返回 `Some(url)` 或 `Some("")`（无远端）；Git 失败返回 `None`（保持 NULL，下次再补）
pub fn primary_remote_url_for_storage(repo_path: &str) -> Option<String> {
    let remotes = list_remotes(Path::new(repo_path)).ok()?;
    Some(pick_primary_remote_url(&remotes).unwrap_or_default())
}

/// 旧数据 `remote_url` 为 NULL 时，列表加载顺带回填，避免前端再按条探测
async fn backfill_missing_remote_urls(
    pool: &PgPool,
    projects: &mut [ProjectRow],
) -> Result<(), AppError> {
    for project in projects.iter_mut() {
        if project.remote_url.is_some() {
            continue;
        }
        let Some(remote_url) = primary_remote_url_for_storage(&project.path) else {
            continue;
        };
        repositories::project::set_remote_url(pool, &project.id, &remote_url).await?;
        project.remote_url = Some(remote_url);
    }
    Ok(())
}

fn compare_primary_remote_identity(old_path: &str, new_path: &str) -> RemotePathCompare {
    let new_identity = match primary_remote_identity(new_path) {
        Ok(identity) => identity,
        Err(_) => return RemotePathCompare::Mismatch,
    };
    let old_identity = match primary_remote_identity(old_path) {
        Ok(identity) => identity,
        // 旧目录已搬迁/不可读：允许改绑到新路径
        Err(_) => return RemotePathCompare::Compatible,
    };

    match (old_identity, new_identity) {
        (None, None) => RemotePathCompare::Compatible,
        (Some(old), Some(new)) if old == new => RemotePathCompare::Compatible,
        _ => RemotePathCompare::Mismatch,
    }
}

async fn ensure_workspace_unlocked_for_move(
    pool: &PgPool,
    workspace_id: Option<&str>,
    action: &str,
) -> Result<(), AppError> {
    let Some(workspace_id) = workspace_id else {
        return Ok(());
    };
    if repositories::workspace::is_locked(pool, workspace_id).await? {
        return Err(AppError::new(
            "VALIDATION",
            format!("锁定的分组不能{action}仓库"),
        ));
    }
    Ok(())
}

fn normalize_description(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn normalize_optional_icon(value: Option<String>) -> Result<String, AppError> {
    match value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
    {
        None => Ok(String::new()),
        Some(icon) => normalize_icon_name(&icon),
    }
}

fn resolve_repo_path(path: &str) -> Result<PathBuf, AppError> {
    let path = normalize_existing_dir(path)?;
    require_git_toplevel(&path)
}

fn resolve_project_name(path: &Path, name: Option<String>) -> Result<String, AppError> {
    let name = name
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| {
            path.file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_else(|| "Repository".to_string())
        });

    if name.is_empty() {
        return Err(AppError::new("VALIDATION", "项目名称不能为空"));
    }

    Ok(name)
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn require_id(id: &str, message: &str) -> Result<(), AppError> {
    if id.trim().is_empty() {
        return Err(AppError::new("VALIDATION", message));
    }
    Ok(())
}
