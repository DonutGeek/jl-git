use chrono::Utc;
use serde::Serialize;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Row, SqlitePool,
};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::git::path::{normalize_existing_dir, require_git_toplevel};
use crate::git::remote::{list_remotes, pick_primary_remote_url};
use crate::git::remote_identity::canonicalize_remote_identity;

mod app_data;
mod chat;
pub use app_data::*;
pub use chat::*;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub workspace_id: Option<String>,
    pub name: String,
    /// 项目简介（可空）
    pub description: Option<String>,
    pub icon: String,
    pub path: String,
    /// 主远端 URL；空串表示已探测但仓库没有远端；NULL 表示尚未写入
    pub remote_url: Option<String>,
    pub last_opened_at: Option<String>,
    pub pinned: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct WorkspaceOrderItem {
    pub id: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone)]
pub struct ProjectOrderItem {
    pub id: String,
    pub workspace_id: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentProjectItem {
    pub project_id: String,
    pub opened_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRow {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub locked: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// 分组树节点（上级选择 / TreeSelect）
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeNode {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub locked: bool,
    pub children: Vec<WorkspaceTreeNode>,
}

/// 仪表盘目录树：分组与仓库混排
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogTreeNode {
    pub key: String,
    pub kind: String,
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub locked: bool,
    pub path: Option<String>,
    pub selectable: bool,
    pub is_leaf: bool,
    pub children: Vec<CatalogTreeNode>,
}

// Rust 命令直接管理 sqlx 连接池，插件仍注册给未来前端 SQL 能力使用。
pub async fn connect(db_path: &Path) -> Result<SqlitePool, AppError> {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(to_db_error)?;

    migrate(&pool).await?;

    Ok(pool)
}

pub async fn migrate(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NULL,
          name TEXT NOT NULL,
          description TEXT NULL,
          icon TEXT NOT NULL DEFAULT '',
          color TEXT NOT NULL DEFAULT 'blue',
          path TEXT NOT NULL UNIQUE,
          remote_url TEXT NULL,
          last_opened_at TEXT NULL,
          pinned INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          parent_id TEXT NULL REFERENCES workspaces(id) ON DELETE SET NULL,
          name TEXT NOT NULL,
          locked INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS recent_projects (
          project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
          opened_at TEXT NOT NULL,
          open_count INTEGER NOT NULL DEFAULT 1
        );

        CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_projects_last_opened_at ON projects(last_opened_at);
        "#,
    )
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    let project_columns = sqlx::query("PRAGMA table_info(projects)")
        .fetch_all(pool)
        .await
        .map_err(to_db_error)?;
    let has_project_sort_order = project_columns.iter().any(|column| {
        column
            .try_get::<String, _>("name")
            .map(|name| name == "sort_order")
            .unwrap_or(false)
    });
    if !has_project_sort_order {
        sqlx::query("ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
            .execute(pool)
            .await
            .map_err(to_db_error)?;
    }
    let has_project_description = project_columns.iter().any(|column| {
        column
            .try_get::<String, _>("name")
            .map(|name| name == "description")
            .unwrap_or(false)
    });
    // 旧库可能在 CREATE 之后才补 description；再查一次以防刚加过 sort_order 的同一批 columns 不含新列
    if !has_project_description {
        let project_columns_again = sqlx::query("PRAGMA table_info(projects)")
            .fetch_all(pool)
            .await
            .map_err(to_db_error)?;
        let exists = project_columns_again.iter().any(|column| {
            column
                .try_get::<String, _>("name")
                .map(|name| name == "description")
                .unwrap_or(false)
        });
        if !exists {
            sqlx::query("ALTER TABLE projects ADD COLUMN description TEXT NULL")
                .execute(pool)
                .await
                .map_err(to_db_error)?;
        }
    }
    let project_columns = sqlx::query("PRAGMA table_info(projects)")
        .fetch_all(pool)
        .await
        .map_err(to_db_error)?;
    let has_project_icon = project_columns.iter().any(|column| {
        column
            .try_get::<String, _>("name")
            .map(|name| name == "icon")
            .unwrap_or(false)
    });
    if !has_project_icon {
        sqlx::query("ALTER TABLE projects ADD COLUMN icon TEXT NOT NULL DEFAULT 'folder-git-2'")
            .execute(pool)
            .await
            .map_err(to_db_error)?;
    }
    // `code` 是旧版本未启用的占位默认值；统一映射到产品当前的 FolderGit2 图标。
    sqlx::query(
        "UPDATE projects SET icon = 'folder-git-2' WHERE icon IS NULL OR TRIM(icon) = '' OR icon = 'code'",
    )
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    let project_columns = sqlx::query("PRAGMA table_info(projects)")
        .fetch_all(pool)
        .await
        .map_err(to_db_error)?;
    let has_remote_url = project_columns.iter().any(|column| {
        column
            .try_get::<String, _>("name")
            .map(|name| name == "remote_url")
            .unwrap_or(false)
    });
    if !has_remote_url {
        sqlx::query("ALTER TABLE projects ADD COLUMN remote_url TEXT NULL")
            .execute(pool)
            .await
            .map_err(to_db_error)?;
    }

    let workspace_columns = sqlx::query("PRAGMA table_info(workspaces)")
        .fetch_all(pool)
        .await
        .map_err(to_db_error)?;
    let has_parent_id = workspace_columns.iter().any(|column| {
        column
            .try_get::<String, _>("name")
            .map(|name| name == "parent_id")
            .unwrap_or(false)
    });
    if !has_parent_id {
        sqlx::query("ALTER TABLE workspaces ADD COLUMN parent_id TEXT NULL")
            .execute(pool)
            .await
            .map_err(to_db_error)?;
    }
    for (column, definition) in [
        ("icon", "TEXT NOT NULL DEFAULT 'folder'"),
        ("color", "TEXT NOT NULL DEFAULT 'blue'"),
        ("locked", "INTEGER NOT NULL DEFAULT 0"),
    ] {
        let exists = workspace_columns.iter().any(|item| {
            item.try_get::<String, _>("name")
                .map(|name| name == column)
                .unwrap_or(false)
        });
        if !exists {
            sqlx::query(&format!(
                "ALTER TABLE workspaces ADD COLUMN {column} {definition}"
            ))
            .execute(pool)
            .await
            .map_err(to_db_error)?;
        }
    }

    sqlx::query(
        r#"
        INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (1, ?1)
        "#,
    )
    .bind(now())
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    sqlx::query(
        r#"
        INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (3, ?1)
        "#,
    )
    .bind(now())
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    migrate_chat_tables(pool).await?;

    sqlx::query(
        r#"
        INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (7, ?1)
        "#,
    )
    .bind(now())
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    sqlx::query(
        r#"
        INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (8, ?1)
        "#,
    )
    .bind(now())
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    Ok(())
}

/// 登记本地仓库。路径已存在时返回已有项目且 `already_exists = true`，不覆盖任何字段。
pub async fn add_project(
    pool: &SqlitePool,
    path: String,
    name: Option<String>,
    workspace_id: Option<String>,
    description: Option<String>,
    icon: Option<String>,
) -> Result<(ProjectRow, bool), AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let path_key = path_to_string(&repo_path);

    let mut tx = pool.begin().await.map_err(to_db_error)?;

    if let Some(existing) = find_project_by_path(&mut *tx, &path_key).await? {
        tx.commit().await.map_err(to_db_error)?;
        return Ok((existing, true));
    }

    // 仅新建路径才校验展示字段与目标分组锁定
    let display_name = resolve_project_name(&repo_path, name)?;
    let description = normalize_description(description);
    let icon = normalize_project_icon(icon)?;
    let timestamp = now();
    let id = uuid::Uuid::new_v4().to_string();
    ensure_workspace_unlocked_for_move(pool, workspace_id.as_deref(), "移入").await?;
    // 可读时写入 URL 或空串（标记已探测）；Git 失败则保持 NULL，列表加载时再补
    let remote_url = primary_remote_url_for_storage(&path_key);

    let insert = sqlx::query(
        r#"
        INSERT INTO projects (id, workspace_id, name, description, icon, path, remote_url, pinned, sort_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, COALESCE((SELECT MAX(sort_order) + 1 FROM projects WHERE workspace_id IS ?2), 0), ?8, ?8)
        "#,
    )
    .bind(&id)
    .bind(&workspace_id)
    .bind(&display_name)
    .bind(&description)
    .bind(&icon)
    .bind(&path_key)
    .bind(&remote_url)
    .bind(&timestamp)
    .execute(&mut *tx)
    .await;

    match insert {
        Ok(_) => {}
        Err(error) if is_unique_constraint_violation(&error) => {
            let existing = find_project_by_path(&mut *tx, &path_key)
                .await?
                .ok_or_else(|| AppError::new("NOT_FOUND", "项目不存在"))?;
            tx.commit().await.map_err(to_db_error)?;
            return Ok((existing, true));
        }
        Err(error) => return Err(to_db_error(error)),
    }

    tx.commit().await.map_err(to_db_error)?;
    Ok((get_project_by_path(pool, &path_key).await?, false))
}

pub async fn list_projects(
    pool: &SqlitePool,
    workspace_id: Option<&str>,
) -> Result<Vec<ProjectRow>, AppError> {
    let rows = if let Some(workspace_id) = workspace_id {
        sqlx::query(
            r#"
            SELECT id, workspace_id, name, description, icon, path, remote_url, last_opened_at, pinned, sort_order, created_at, updated_at
            FROM projects
            WHERE workspace_id = ?1
            ORDER BY pinned DESC, sort_order ASC, name COLLATE NOCASE ASC
            "#,
        )
        .bind(workspace_id)
        .fetch_all(pool)
        .await
        .map_err(to_db_error)?
    } else {
        sqlx::query(
            r#"
            SELECT id, workspace_id, name, description, icon, path, remote_url, last_opened_at, pinned, sort_order, created_at, updated_at
            FROM projects
            ORDER BY pinned DESC, sort_order ASC, name COLLATE NOCASE ASC
            "#,
        )
        .fetch_all(pool)
        .await
        .map_err(to_db_error)?
    };

    let mut projects = rows
        .into_iter()
        .map(row_to_project)
        .collect::<Result<Vec<_>, _>>()?;
    backfill_missing_remote_urls(pool, &mut projects).await?;
    Ok(projects)
}

pub async fn remove_project(pool: &SqlitePool, id: &str) -> Result<(), AppError> {
    if id.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "项目 ID 不能为空"));
    }

    let result = sqlx::query("DELETE FROM projects WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(to_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::new("NOT_FOUND", "项目不存在"));
    }

    Ok(())
}

pub async fn update_project(
    pool: &SqlitePool,
    id: &str,
    name: Option<String>,
    workspace_id: Option<Option<String>>,
    description: Option<Option<String>>,
    icon: Option<String>,
    path: Option<String>,
    allow_remote_mismatch: bool,
) -> Result<ProjectRow, AppError> {
    if id.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "项目 ID 不能为空"));
    }

    let name = name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let description = description.map(normalize_description);
    let icon = icon
        .map(|value| normalize_project_icon(Some(value)))
        .transpose()?;
    let next_path = resolve_project_path_update(pool, id, path, allow_remote_mismatch).await?;
    if name.is_none()
        && workspace_id.is_none()
        && description.is_none()
        && icon.is_none()
        && next_path.is_none()
    {
        return Err(AppError::new("VALIDATION", "没有可更新的项目字段"));
    }

    if let Some(next_workspace_id) = workspace_id.as_ref() {
        let current_workspace_id = sqlx::query_scalar::<_, Option<String>>(
            "SELECT workspace_id FROM projects WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(to_db_error)?
        .flatten();
        if current_workspace_id.as_ref() != next_workspace_id.as_ref() {
            ensure_workspace_unlocked_for_move(pool, current_workspace_id.as_deref(), "移出")
                .await?;
            ensure_workspace_unlocked_for_move(pool, next_workspace_id.as_deref(), "移入").await?;
        }
    }

    let timestamp = now();
    let next_remote_url = next_path
        .as_ref()
        .and_then(|path| primary_remote_url_for_storage(path));
    let result = sqlx::query(
        r#"
        UPDATE projects
        SET name = COALESCE(?1, name),
            workspace_id = CASE WHEN ?2 THEN ?3 ELSE workspace_id END,
            description = CASE WHEN ?4 THEN ?5 ELSE description END,
            icon = COALESCE(?6, icon),
            path = COALESCE(?7, path),
            remote_url = CASE WHEN ?8 THEN COALESCE(?9, remote_url) ELSE remote_url END,
            updated_at = ?10
        WHERE id = ?11
        "#,
    )
    .bind(&name)
    .bind(workspace_id.is_some())
    .bind(workspace_id.flatten())
    .bind(description.is_some())
    .bind(description.flatten())
    .bind(icon)
    .bind(&next_path)
    .bind(next_path.is_some())
    .bind(&next_remote_url)
    .bind(&timestamp)
    .bind(id)
    .execute(pool)
    .await;

    match result {
        Ok(result) => {
            if result.rows_affected() == 0 {
                return Err(AppError::new("NOT_FOUND", "项目不存在"));
            }
        }
        Err(error) if is_unique_constraint_violation(&error) => {
            return Err(AppError::new("ALREADY_EXISTS", "该路径已登记为其他仓库"));
        }
        Err(error) => return Err(to_db_error(error)),
    }

    get_project_by_id(pool, id).await
}

/// 解析改路径：规范化 Git 顶层、查重、与旧路径比对主远端身份。
async fn resolve_project_path_update(
    pool: &SqlitePool,
    id: &str,
    path: Option<String>,
    allow_remote_mismatch: bool,
) -> Result<Option<String>, AppError> {
    let Some(path) = path
        .map(|value| value.trim().to_string())
        .filter(|v| !v.is_empty())
    else {
        return Ok(None);
    };

    let current = get_project_by_id(pool, id).await?;
    let repo_path = resolve_repo_path(&path)?;
    let path_key = path_to_string(&repo_path);
    if path_key == current.path {
        return Ok(None);
    }

    if let Some(other) = find_project_by_path(pool, &path_key).await? {
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
fn primary_remote_url_for_storage(repo_path: &str) -> Option<String> {
    let remotes = list_remotes(Path::new(repo_path)).ok()?;
    Some(pick_primary_remote_url(&remotes).unwrap_or_default())
}

/// 旧数据 `remote_url` 为 NULL 时，列表加载顺带回填，避免前端再按条探测
async fn backfill_missing_remote_urls(
    pool: &SqlitePool,
    projects: &mut [ProjectRow],
) -> Result<(), AppError> {
    for project in projects.iter_mut() {
        if project.remote_url.is_some() {
            continue;
        }
        let Some(remote_url) = primary_remote_url_for_storage(&project.path) else {
            continue;
        };
        sqlx::query("UPDATE projects SET remote_url = ?1 WHERE id = ?2")
            .bind(&remote_url)
            .bind(&project.id)
            .execute(pool)
            .await
            .map_err(to_db_error)?;
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
    pool: &SqlitePool,
    workspace_id: Option<&str>,
    action: &str,
) -> Result<(), AppError> {
    let Some(workspace_id) = workspace_id else {
        return Ok(());
    };
    let locked = sqlx::query_scalar::<_, i64>("SELECT locked FROM workspaces WHERE id = ?1")
        .bind(workspace_id)
        .fetch_optional(pool)
        .await
        .map_err(to_db_error)?
        .unwrap_or(0);
    if locked != 0 {
        return Err(AppError::new(
            "VALIDATION",
            &format!("锁定的分组不能{action}仓库"),
        ));
    }
    Ok(())
}

pub async fn list_workspaces(pool: &SqlitePool) -> Result<Vec<WorkspaceRow>, AppError> {
    sqlx::query(
        "SELECT id, parent_id, name, icon, color, locked, sort_order, created_at, updated_at FROM workspaces ORDER BY sort_order, name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await
    .map_err(to_db_error)?
    .into_iter()
    .map(row_to_workspace)
    .collect()
}

/// 编辑上级时排除自身及子孙，避免成环
pub fn collect_workspace_subtree_ids(
    workspaces: &[WorkspaceRow],
    root_id: &str,
) -> HashSet<String> {
    let mut ids = HashSet::from([root_id.to_string()]);
    let mut grew = true;
    while grew {
        grew = false;
        for workspace in workspaces {
            if let Some(parent_id) = workspace.parent_id.as_deref() {
                if ids.contains(parent_id) && ids.insert(workspace.id.clone()) {
                    grew = true;
                }
            }
        }
    }
    ids
}

fn workspace_to_tree_node(
    workspaces: &[WorkspaceRow],
    workspace: &WorkspaceRow,
    exclude: &HashSet<String>,
) -> WorkspaceTreeNode {
    WorkspaceTreeNode {
        id: workspace.id.clone(),
        name: workspace.name.clone(),
        icon: workspace.icon.clone(),
        color: workspace.color.clone(),
        locked: workspace.locked,
        children: workspaces
            .iter()
            .filter(|child| {
                child.parent_id.as_deref() == Some(workspace.id.as_str())
                    && !exclude.contains(&child.id)
            })
            .map(|child| workspace_to_tree_node(workspaces, child, exclude))
            .collect(),
    }
}

/// 把扁平分组收成树；`exclude_id` 会去掉该节点及其子孙
pub fn build_workspace_tree(
    workspaces: &[WorkspaceRow],
    exclude_id: Option<&str>,
) -> Vec<WorkspaceTreeNode> {
    let exclude = exclude_id
        .map(|id| collect_workspace_subtree_ids(workspaces, id))
        .unwrap_or_default();
    let id_set: HashSet<&str> = workspaces.iter().map(|item| item.id.as_str()).collect();
    workspaces
        .iter()
        .filter(|workspace| {
            !exclude.contains(&workspace.id)
                && match workspace.parent_id.as_deref() {
                    None => true,
                    Some(parent_id) => !id_set.contains(parent_id),
                }
        })
        .map(|workspace| workspace_to_tree_node(workspaces, workspace, &exclude))
        .collect()
}

fn project_matches_catalog_query(project: &ProjectRow, query: &str) -> bool {
    if query.is_empty() {
        return true;
    }
    project.name.to_lowercase().contains(query) || project.path.to_lowercase().contains(query)
}

fn catalog_project_node(project: &ProjectRow) -> CatalogTreeNode {
    CatalogTreeNode {
        key: format!("project:{}", project.id),
        kind: "project".into(),
        id: project.id.clone(),
        parent_id: project.workspace_id.clone(),
        name: project.name.clone(),
        icon: project.icon.clone(),
        color: String::new(),
        locked: false,
        path: Some(project.path.clone()),
        selectable: true,
        is_leaf: true,
        children: vec![],
    }
}

fn catalog_workspace_node(
    workspaces: &[WorkspaceRow],
    projects: &[ProjectRow],
    workspace: &WorkspaceRow,
    query: &str,
) -> CatalogTreeNode {
    CatalogTreeNode {
        key: format!("workspace:{}", workspace.id),
        kind: "workspace".into(),
        id: workspace.id.clone(),
        parent_id: workspace.parent_id.clone(),
        name: workspace.name.clone(),
        icon: workspace.icon.clone(),
        color: workspace.color.clone(),
        locked: workspace.locked,
        path: None,
        selectable: false,
        is_leaf: false,
        children: catalog_children(workspaces, projects, Some(workspace.id.as_str()), query),
    }
}

struct MixedCatalogItem<'a> {
    sort_order: i64,
    is_project: bool,
    name: &'a str,
    workspace: Option<&'a WorkspaceRow>,
    project: Option<&'a ProjectRow>,
}

fn catalog_children(
    workspaces: &[WorkspaceRow],
    projects: &[ProjectRow],
    parent_id: Option<&str>,
    query: &str,
) -> Vec<CatalogTreeNode> {
    let id_set: HashSet<&str> = workspaces.iter().map(|item| item.id.as_str()).collect();
    let mut items: Vec<MixedCatalogItem<'_>> = Vec::new();

    for workspace in workspaces {
        let in_parent = match parent_id {
            None => {
                workspace.parent_id.is_none()
                    || !id_set.contains(workspace.parent_id.as_deref().unwrap_or(""))
            }
            Some(id) => workspace.parent_id.as_deref() == Some(id),
        };
        if in_parent {
            items.push(MixedCatalogItem {
                sort_order: workspace.sort_order,
                is_project: false,
                name: workspace.name.as_str(),
                workspace: Some(workspace),
                project: None,
            });
        }
    }

    for project in projects {
        let in_parent = match parent_id {
            None => project.workspace_id.is_none(),
            Some(id) => project.workspace_id.as_deref() == Some(id),
        };
        if in_parent && project_matches_catalog_query(project, query) {
            items.push(MixedCatalogItem {
                sort_order: project.sort_order,
                is_project: true,
                name: project.name.as_str(),
                workspace: None,
                project: Some(project),
            });
        }
    }

    items.sort_by(|left, right| {
        left.sort_order
            .cmp(&right.sort_order)
            .then_with(|| right.is_project.cmp(&left.is_project))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    items
        .into_iter()
        .filter_map(|item| {
            if let Some(project) = item.project {
                return Some(catalog_project_node(project));
            }
            item.workspace
                .map(|workspace| catalog_workspace_node(workspaces, projects, workspace, query))
        })
        .collect()
}

/// 分组 + 仓库混排目录树；`query` 只过滤仓库名称/路径
pub fn build_catalog_tree(
    workspaces: &[WorkspaceRow],
    projects: &[ProjectRow],
    query: Option<&str>,
) -> Vec<CatalogTreeNode> {
    let query = query.unwrap_or("").trim().to_lowercase();
    catalog_children(workspaces, projects, None, &query)
}

fn normalize_workspace_color(value: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    // 早期库把颜色存成 blue/green 等名字，读出时转成 HEX
    let legacy = match trimmed.to_ascii_lowercase().as_str() {
        "blue" => Some("#5F75C1"),
        "green" => Some("#4E925E"),
        "orange" => Some("#D27830"),
        "purple" => Some("#AA6BAE"),
        "red" => Some("#CD6055"),
        _ => None,
    };
    if let Some(color) = legacy {
        return Ok(color.to_string());
    }
    let Some(hex) = trimmed.strip_prefix('#') else {
        return Err(AppError::new("VALIDATION", "分组颜色必须是 #RRGGBB 格式"));
    };
    if hex.len() != 6 || !hex.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err(AppError::new("VALIDATION", "分组颜色必须是 #RRGGBB 格式"));
    }
    Ok(format!("#{}", hex.to_ascii_uppercase()))
}

pub async fn create_workspace(
    pool: &SqlitePool,
    name: String,
    parent_id: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<WorkspaceRow, AppError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::new("VALIDATION", "分组名称不能为空"));
    }
    let parent_id = parent_id.filter(|value| !value.trim().is_empty());
    let icon = normalize_workspace_icon(icon)?;
    let color = normalize_workspace_color(color.as_deref().unwrap_or(""))?;
    if let Some(parent_id) = parent_id.as_deref() {
        let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(1) FROM workspaces WHERE id = ?1")
            .bind(parent_id)
            .fetch_one(pool)
            .await
            .map_err(to_db_error)?;
        if exists == 0 {
            return Err(AppError::new("NOT_FOUND", "父分组不存在"));
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = now();
    sqlx::query(
        "INSERT INTO workspaces (id, parent_id, name, icon, color, locked, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6, ?6)",
    )
    .bind(&id)
    .bind(parent_id)
    .bind(name)
    .bind(icon)
    .bind(color)
    .bind(timestamp)
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    get_workspace(pool, &id).await
}

pub async fn update_workspace(
    pool: &SqlitePool,
    id: &str,
    name: Option<String>,
    parent_id: Option<Option<String>>,
    icon: Option<String>,
    color: Option<String>,
    locked: Option<bool>,
) -> Result<WorkspaceRow, AppError> {
    let name = name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let icon = match icon {
        Some(value) => Some(normalize_workspace_icon(Some(value))?),
        None => None,
    };
    let color = color
        .as_deref()
        .map(normalize_workspace_color)
        .transpose()?;
    if name.is_none()
        && parent_id.is_none()
        && icon.is_none()
        && color.is_none()
        && locked.is_none()
    {
        return Err(AppError::new("VALIDATION", "没有可更新的分组字段"));
    }

    let current = get_workspace(pool, id).await?;
    if current.locked && parent_id.is_some() {
        return Err(AppError::new("VALIDATION", "锁定的分组不能调整父级"));
    }

    if let Some(Some(parent_id)) = parent_id.as_ref() {
        if parent_id == id {
            return Err(AppError::new("VALIDATION", "不能将分组设为自己的父级"));
        }
        let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(1) FROM workspaces WHERE id = ?1")
            .bind(parent_id)
            .fetch_one(pool)
            .await
            .map_err(to_db_error)?;
        if exists == 0 {
            return Err(AppError::new("NOT_FOUND", "父分组不存在"));
        }
        // 禁止把祖先挂到子孙下，避免环
        let mut current_parent = Some(parent_id.clone());
        while let Some(cursor) = current_parent {
            if cursor == id {
                return Err(AppError::new("VALIDATION", "不能将分组移动到其子分组下"));
            }
            current_parent = sqlx::query_scalar::<_, Option<String>>(
                "SELECT parent_id FROM workspaces WHERE id = ?1",
            )
            .bind(&cursor)
            .fetch_optional(pool)
            .await
            .map_err(to_db_error)?
            .flatten();
        }
    }

    let timestamp = now();
    let result = sqlx::query(
        "UPDATE workspaces
         SET name = COALESCE(?1, name),
             parent_id = CASE WHEN ?2 THEN ?3 ELSE parent_id END,
             icon = COALESCE(?4, icon),
             color = COALESCE(?5, color),
             locked = COALESCE(?6, locked),
             updated_at = ?7
         WHERE id = ?8",
    )
    .bind(&name)
    .bind(parent_id.is_some())
    .bind(parent_id.clone().flatten())
    .bind(&icon)
    .bind(&color)
    .bind(locked.map(|value| if value { 1 } else { 0 }))
    .bind(&timestamp)
    .bind(id)
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::new("NOT_FOUND", "分组不存在"));
    }

    get_workspace(pool, id).await
}

pub async fn delete_workspace(pool: &SqlitePool, id: &str) -> Result<(), AppError> {
    let current = get_workspace(pool, id).await?;
    if current.locked {
        return Err(AppError::new("VALIDATION", "锁定的分组不能删除"));
    }

    let mut transaction = pool.begin().await.map_err(to_db_error)?;
    let deleted = sqlx::query("DELETE FROM workspaces WHERE id = ?1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(to_db_error)?;
    if deleted.rows_affected() == 0 {
        return Err(AppError::new("NOT_FOUND", "分组不存在"));
    }
    sqlx::query("UPDATE workspaces SET parent_id = NULL WHERE parent_id = ?1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(to_db_error)?;
    sqlx::query("UPDATE projects SET workspace_id = NULL WHERE workspace_id = ?1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(to_db_error)?;
    transaction.commit().await.map_err(to_db_error)?;

    Ok(())
}

pub async fn reorder_projects_and_workspaces(
    pool: &SqlitePool,
    workspaces: Vec<WorkspaceOrderItem>,
    projects: Vec<ProjectOrderItem>,
) -> Result<(), AppError> {
    let timestamp = now();
    let mut transaction = pool.begin().await.map_err(to_db_error)?;

    for workspace in &workspaces {
        let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(1) FROM workspaces WHERE id = ?1")
            .bind(&workspace.id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(to_db_error)?;
        if exists == 0 {
            return Err(AppError::new("NOT_FOUND", "分组不存在"));
        }
    }
    for project in &projects {
        let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(1) FROM projects WHERE id = ?1")
            .bind(&project.id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(to_db_error)?;
        if exists == 0 {
            return Err(AppError::new("NOT_FOUND", "项目不存在"));
        }
        let current_workspace_id = sqlx::query_scalar::<_, Option<String>>(
            "SELECT workspace_id FROM projects WHERE id = ?1",
        )
        .bind(&project.id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(to_db_error)?;
        if current_workspace_id != project.workspace_id {
            if let Some(source_id) = current_workspace_id.as_deref() {
                let source_locked =
                    sqlx::query_scalar::<_, i64>("SELECT locked FROM workspaces WHERE id = ?1")
                        .bind(source_id)
                        .fetch_optional(&mut *transaction)
                        .await
                        .map_err(to_db_error)?
                        .unwrap_or(0);
                if source_locked != 0 {
                    return Err(AppError::new("VALIDATION", "锁定的分组不能移出仓库"));
                }
            }
            if let Some(target_id) = project.workspace_id.as_deref() {
                let target_locked =
                    sqlx::query_scalar::<_, i64>("SELECT locked FROM workspaces WHERE id = ?1")
                        .bind(target_id)
                        .fetch_optional(&mut *transaction)
                        .await
                        .map_err(to_db_error)?
                        .unwrap_or(0);
                if target_locked != 0 {
                    return Err(AppError::new("VALIDATION", "锁定的分组不能移入仓库"));
                }
            }
        }
        if let Some(workspace_id) = &project.workspace_id {
            let workspace_exists =
                sqlx::query_scalar::<_, i64>("SELECT COUNT(1) FROM workspaces WHERE id = ?1")
                    .bind(workspace_id)
                    .fetch_one(&mut *transaction)
                    .await
                    .map_err(to_db_error)?;
            if workspace_exists == 0 {
                return Err(AppError::new("NOT_FOUND", "目标分组不存在"));
            }
        }
    }

    for workspace in workspaces {
        sqlx::query("UPDATE workspaces SET sort_order = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(workspace.sort_order)
            .bind(&timestamp)
            .bind(&workspace.id)
            .execute(&mut *transaction)
            .await
            .map_err(to_db_error)?;
    }
    for project in projects {
        sqlx::query(
            "UPDATE projects SET workspace_id = ?1, sort_order = ?2, updated_at = ?3 WHERE id = ?4",
        )
        .bind(&project.workspace_id)
        .bind(project.sort_order)
        .bind(&timestamp)
        .bind(&project.id)
        .execute(&mut *transaction)
        .await
        .map_err(to_db_error)?;
    }

    transaction.commit().await.map_err(to_db_error)?;
    Ok(())
}

async fn get_workspace(pool: &SqlitePool, id: &str) -> Result<WorkspaceRow, AppError> {
    let row = sqlx::query(
        "SELECT id, parent_id, name, icon, color, locked, sort_order, created_at, updated_at FROM workspaces WHERE id = ?1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(to_db_error)?;

    row_to_workspace(row)
}

fn row_to_workspace(row: sqlx::sqlite::SqliteRow) -> Result<WorkspaceRow, AppError> {
    let stored_color: String = row.try_get("color").map_err(to_db_error)?;
    let locked: i64 = row.try_get("locked").map_err(to_db_error)?;
    Ok(WorkspaceRow {
        id: row.try_get("id").map_err(to_db_error)?,
        parent_id: row.try_get("parent_id").map_err(to_db_error)?,
        name: row.try_get("name").map_err(to_db_error)?,
        icon: row.try_get("icon").map_err(to_db_error)?,
        color: normalize_workspace_color(&stored_color).unwrap_or_default(),
        locked: locked != 0,
        sort_order: row.try_get("sort_order").map_err(to_db_error)?,
        created_at: row.try_get("created_at").map_err(to_db_error)?,
        updated_at: row.try_get("updated_at").map_err(to_db_error)?,
    })
}

pub async fn touch_opened(pool: &SqlitePool, id: &str) -> Result<(), AppError> {
    if id.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "项目 ID 不能为空"));
    }

    let timestamp = now();
    let path: String = sqlx::query_scalar("SELECT path FROM projects WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(to_db_error)?
        .ok_or_else(|| AppError::new("NOT_FOUND", "项目不存在"))?;
    let remote_url = primary_remote_url_for_storage(&path);
    let mut tx = pool.begin().await.map_err(to_db_error)?;
    let result = sqlx::query(
        r#"
        UPDATE projects
        SET last_opened_at = ?1, updated_at = ?1, remote_url = COALESCE(?2, remote_url)
        WHERE id = ?3
        "#,
    )
    .bind(&timestamp)
    .bind(&remote_url)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(to_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::new("NOT_FOUND", "项目不存在"));
    }

    sqlx::query(
        r#"
        INSERT INTO recent_projects (project_id, opened_at, open_count)
        VALUES (?1, ?2, 1)
        ON CONFLICT(project_id) DO UPDATE SET
          opened_at = excluded.opened_at,
          open_count = recent_projects.open_count + 1
        "#,
    )
    .bind(id)
    .bind(&timestamp)
    .execute(&mut *tx)
    .await
    .map_err(to_db_error)?;

    sqlx::query(
        r#"
        DELETE FROM recent_projects
        WHERE project_id IN (
          SELECT project_id
          FROM recent_projects
          ORDER BY opened_at DESC
          LIMIT -1 OFFSET 20
        )
        "#,
    )
    .execute(&mut *tx)
    .await
    .map_err(to_db_error)?;

    tx.commit().await.map_err(to_db_error)?;

    Ok(())
}

pub async fn remove_recent(pool: &SqlitePool, id: &str) -> Result<(), AppError> {
    if id.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "项目 ID 不能为空"));
    }

    sqlx::query("DELETE FROM recent_projects WHERE project_id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(to_db_error)?;

    Ok(())
}

pub async fn list_recent(
    pool: &SqlitePool,
    limit: Option<u32>,
) -> Result<Vec<RecentProjectItem>, AppError> {
    let limit = limit.unwrap_or(20).clamp(1, 100);
    let rows = sqlx::query(
        r#"
        SELECT project_id, opened_at
        FROM recent_projects
        ORDER BY opened_at DESC
        LIMIT ?1
        "#,
    )
    .bind(i64::from(limit))
    .fetch_all(pool)
    .await
    .map_err(to_db_error)?;

    rows.into_iter()
        .map(|row| {
            Ok(RecentProjectItem {
                project_id: row.try_get("project_id").map_err(to_db_error)?,
                opened_at: row.try_get("opened_at").map_err(to_db_error)?,
            })
        })
        .collect()
}

async fn find_project_by_path<'e, E>(
    executor: E,
    path: &str,
) -> Result<Option<ProjectRow>, AppError>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let row = sqlx::query(
        r#"
        SELECT id, workspace_id, name, description, icon, path, remote_url, last_opened_at, pinned, sort_order, created_at, updated_at
        FROM projects
        WHERE path = ?1
        "#,
    )
    .bind(path)
    .fetch_optional(executor)
    .await
    .map_err(to_db_error)?;

    row.map(row_to_project).transpose()
}

async fn get_project_by_path(pool: &SqlitePool, path: &str) -> Result<ProjectRow, AppError> {
    find_project_by_path(pool, path)
        .await?
        .ok_or_else(|| AppError::new("NOT_FOUND", "项目不存在"))
}

fn is_unique_constraint_violation(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => {
            let message = db_error.message();
            message.contains("UNIQUE constraint failed")
                || db_error.code().as_deref() == Some("2067")
                || db_error.code().as_deref() == Some("1555")
        }
        _ => false,
    }
}

async fn get_project_by_id(pool: &SqlitePool, id: &str) -> Result<ProjectRow, AppError> {
    let row = sqlx::query(
        r#"
        SELECT id, workspace_id, name, description, icon, path, remote_url, last_opened_at, pinned, sort_order, created_at, updated_at
        FROM projects
        WHERE id = ?1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(to_db_error)?
    .ok_or_else(|| AppError::new("NOT_FOUND", "项目不存在"))?;

    row_to_project(row)
}

fn row_to_project(row: sqlx::sqlite::SqliteRow) -> Result<ProjectRow, AppError> {
    let pinned: i64 = row.try_get("pinned").map_err(to_db_error)?;

    Ok(ProjectRow {
        id: row.try_get("id").map_err(to_db_error)?,
        workspace_id: row.try_get("workspace_id").map_err(to_db_error)?,
        name: row.try_get("name").map_err(to_db_error)?,
        description: row.try_get("description").map_err(to_db_error)?,
        icon: row.try_get("icon").map_err(to_db_error)?,
        path: row.try_get("path").map_err(to_db_error)?,
        remote_url: row.try_get("remote_url").map_err(to_db_error)?,
        last_opened_at: row.try_get("last_opened_at").map_err(to_db_error)?,
        pinned: pinned != 0,
        sort_order: row.try_get("sort_order").map_err(to_db_error)?,
        created_at: row.try_get("created_at").map_err(to_db_error)?,
        updated_at: row.try_get("updated_at").map_err(to_db_error)?,
    })
}

fn normalize_description(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn normalize_lucide_icon_name(value: Option<String>, default: &str) -> Result<String, AppError> {
    let icon = value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| default.to_string());
    if icon.len() > 64 {
        return Err(AppError::new("VALIDATION", "图标名称过长"));
    }
    if !icon.chars().all(|character| {
        character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
    }) || icon.starts_with('-')
        || icon.ends_with('-')
        || icon.contains("--")
        || !icon
            .chars()
            .any(|character| character.is_ascii_alphanumeric())
    {
        return Err(AppError::new("VALIDATION", "图标名称须为 kebab-case"));
    }
    Ok(icon)
}

fn normalize_project_icon(value: Option<String>) -> Result<String, AppError> {
    let icon = value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty());
    match icon {
        None => Ok(String::new()),
        Some(icon) => normalize_lucide_icon_name(Some(icon), ""),
    }
}

fn normalize_workspace_icon(value: Option<String>) -> Result<String, AppError> {
    let icon = value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty());
    match icon {
        None => Ok(String::new()),
        Some(icon) => normalize_lucide_icon_name(Some(icon), ""),
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

pub(crate) fn now() -> String {
    Utc::now().to_rfc3339()
}

pub(crate) fn to_db_error(error: sqlx::Error) -> AppError {
    AppError::new("DB_ERROR", "数据库操作失败").with_details(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use uuid::Uuid;

    fn run_async<T>(future: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(future)
    }

    async fn test_pool() -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("测试数据库应可创建")
    }

    fn create_git_repo() -> PathBuf {
        let base_dir = std::env::current_dir()
            .expect("当前目录应存在")
            .join("target")
            .join("test-repos");
        let path = base_dir.join(format!("jlgit-test-{}", Uuid::new_v4()));
        let template_dir = base_dir.join("empty-template");
        fs::create_dir_all(&path).expect("测试仓库目录应可创建");
        fs::create_dir_all(&template_dir).expect("测试 Git 模板目录应可创建");

        let output = Command::new("git")
            .arg("init")
            .arg("--template")
            .arg(&template_dir)
            .arg(&path)
            .output()
            .expect("git init 应可执行");
        assert!(
            output.status.success(),
            "git init 失败: {}",
            String::from_utf8_lossy(&output.stderr)
        );

        path
    }

    #[test]
    fn migrate_creates_empty_project_tables() {
        run_async(async {
            let pool = test_pool().await;

            migrate(&pool).await.expect("迁移应成功");
            let projects = list_projects(&pool, None).await.expect("查询应成功");
            let recent = list_recent(&pool, None).await.expect("查询应成功");

            assert!(projects.is_empty());
            assert!(recent.is_empty());
        });
    }

    #[test]
    fn migrate_adds_project_icon_to_legacy_database() {
        run_async(async {
            let pool = test_pool().await;
            sqlx::query(
                r#"
                CREATE TABLE projects (
                  id TEXT PRIMARY KEY,
                  workspace_id TEXT NULL,
                  name TEXT NOT NULL,
                  description TEXT NULL,
                  path TEXT NOT NULL UNIQUE,
                  last_opened_at TEXT NULL,
                  pinned INTEGER NOT NULL DEFAULT 0,
                  sort_order INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                )
                "#,
            )
            .execute(&pool)
            .await
            .expect("旧项目表应可创建");

            migrate(&pool).await.expect("迁移应成功");
            let columns = sqlx::query("PRAGMA table_info(projects)")
                .fetch_all(&pool)
                .await
                .expect("应能读取项目表结构");
            let column_names = columns
                .iter()
                .map(|column| column.try_get::<String, _>("name").expect("列名应存在"))
                .collect::<Vec<_>>();

            assert!(
                column_names.contains(&"icon".to_string()),
                "项目表应支持图标"
            );
            assert!(
                column_names.contains(&"remote_url".to_string()),
                "项目表应持久化主远端"
            );
        });
    }

    #[test]
    fn migrate_adds_workspace_parent_id_column() {
        run_async(async {
            let pool = test_pool().await;

            migrate(&pool).await.expect("迁移应成功");
            let columns = sqlx::query("PRAGMA table_info(workspaces)")
                .fetch_all(&pool)
                .await
                .expect("应能读取分组表结构");
            let column_names = columns
                .iter()
                .map(|column| column.try_get::<String, _>("name").expect("列名应存在"))
                .collect::<Vec<_>>();

            assert!(
                column_names.contains(&"parent_id".to_string()),
                "分组表应支持父分组 ID"
            );
            assert!(
                column_names.contains(&"icon".to_string()),
                "分组表应支持图标"
            );
            assert!(
                column_names.contains(&"color".to_string()),
                "分组表应支持颜色"
            );
        });
    }

    #[test]
    fn create_workspace_persists_parent_relationship() {
        run_async(async {
            let pool = test_pool().await;
            migrate(&pool).await.expect("迁移应成功");

            let root = create_workspace(&pool, "业务".to_string(), None, None, None)
                .await
                .expect("根分组应可创建");
            let child = create_workspace(
                &pool,
                "小程序".to_string(),
                Some(root.id.clone()),
                None,
                None,
            )
            .await
            .expect("子分组应可创建");

            assert_eq!(child.parent_id.as_deref(), Some(root.id.as_str()));
        });
    }

    fn sample_workspace(
        id: &str,
        parent_id: Option<&str>,
        name: &str,
        sort_order: i64,
    ) -> WorkspaceRow {
        WorkspaceRow {
            id: id.to_string(),
            parent_id: parent_id.map(str::to_string),
            name: name.to_string(),
            icon: String::new(),
            color: String::new(),
            locked: false,
            sort_order,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn sample_project(
        id: &str,
        workspace_id: Option<&str>,
        name: &str,
        path: &str,
        sort_order: i64,
    ) -> ProjectRow {
        ProjectRow {
            id: id.to_string(),
            workspace_id: workspace_id.map(str::to_string),
            name: name.to_string(),
            description: None,
            icon: String::new(),
            path: path.to_string(),
            remote_url: None,
            last_opened_at: None,
            pinned: false,
            sort_order,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn build_workspace_tree_nests_children_and_excludes_subtree() {
        let root = sample_workspace("root", None, "业务", 0);
        let child = sample_workspace("child", Some("root"), "小程序", 0);
        let other = sample_workspace("other", None, "独立", 1);
        let workspaces = vec![root.clone(), child.clone(), other.clone()];

        let tree = build_workspace_tree(&workspaces, None);
        assert_eq!(tree.len(), 2);
        assert_eq!(tree[0].id, "root");
        assert_eq!(tree[0].children.len(), 1);
        assert_eq!(tree[0].children[0].id, "child");
        assert_eq!(tree[1].id, "other");

        let excluded = build_workspace_tree(&workspaces, Some("root"));
        assert_eq!(excluded.len(), 1);
        assert_eq!(excluded[0].id, "other");
    }

    #[test]
    fn build_catalog_tree_orders_projects_before_groups_and_filters_query() {
        let workspace = sample_workspace("w1", None, "组", 0);
        let inside = sample_project("p-in", Some("w1"), "内部仓", "/tmp/in", 0);
        let root_project = sample_project("p-root", None, "根仓", "/tmp/root", 0);
        let other = sample_project("p-other", None, "其它", "/tmp/other", 0);

        let tree = build_catalog_tree(&[workspace.clone()], &[inside, root_project, other], None);
        assert_eq!(
            tree.iter()
                .map(|node| node.kind.as_str())
                .collect::<Vec<_>>(),
            ["project", "project", "workspace"]
        );
        assert_eq!(tree[2].id, "w1");
        assert_eq!(tree[2].children[0].id, "p-in");

        let filtered = build_catalog_tree(
            &[workspace],
            &[
                sample_project("p-root", None, "根仓", "/tmp/root", 0),
                sample_project("p-other", None, "其它", "/tmp/other", 0),
            ],
            Some("root"),
        );
        let project_ids: Vec<&str> = filtered
            .iter()
            .filter(|node| node.kind == "project")
            .map(|node| node.id.as_str())
            .collect();
        assert_eq!(project_ids, ["p-root"]);
        assert!(filtered.iter().any(|node| node.kind == "workspace"));
    }

    #[test]
    fn add_project_normalizes_git_repo_and_rejects_overwrite_on_existing_path() {
        run_async(async {
            let pool = test_pool().await;
            migrate(&pool).await.expect("迁移应成功");
            let repo = create_git_repo();
            let original_name = repo
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("repo")
                .to_string();

            let (first, already_exists) = add_project(
                &pool,
                repo.to_string_lossy().into_owned(),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("Git 仓库应可登记");
            assert!(!already_exists);
            assert_eq!(first.icon, "");
            assert_eq!(first.name, original_name);
            assert_eq!(first.remote_url.as_deref(), Some(""));

            let (second, already_exists) = add_project(
                &pool,
                repo.to_string_lossy().into_owned(),
                Some("Renamed".to_string()),
                None,
                None,
                Some("terminal".to_string()),
            )
            .await
            .expect("重复路径应返回已有项目");

            assert!(already_exists);
            assert_eq!(first.id, second.id);
            assert_eq!(second.name, original_name);
            assert_eq!(second.icon, "");
            assert_eq!(second.path, repo.canonicalize().unwrap().to_string_lossy());
        });
    }

    #[test]
    fn add_project_persists_primary_remote_url() {
        run_async(async {
            let pool = test_pool().await;
            migrate(&pool).await.expect("迁移应成功");
            let repo = create_git_repo();
            let remote_add = Command::new("git")
                .current_dir(&repo)
                .args(["remote", "add", "origin", "git@github.com:acme/app.git"])
                .output()
                .expect("git remote add 应可执行");
            assert!(
                remote_add.status.success(),
                "git remote add 失败: {}",
                String::from_utf8_lossy(&remote_add.stderr)
            );

            let (project, already_exists) = add_project(
                &pool,
                repo.to_string_lossy().into_owned(),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("Git 仓库应可登记");
            assert!(!already_exists);
            assert_eq!(
                project.remote_url.as_deref(),
                Some("git@github.com:acme/app.git")
            );
        });
    }

    #[test]
    fn list_projects_backfills_null_remote_url() {
        run_async(async {
            let pool = test_pool().await;
            migrate(&pool).await.expect("迁移应成功");
            let repo = create_git_repo();
            let remote_add = Command::new("git")
                .current_dir(&repo)
                .args(["remote", "add", "origin", "https://github.com/acme/app.git"])
                .output()
                .expect("git remote add 应可执行");
            assert!(remote_add.status.success());

            let timestamp = now();
            sqlx::query(
                "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
            )
            .bind("legacy-project")
            .bind("legacy")
            .bind(repo.to_string_lossy().into_owned())
            .bind(&timestamp)
            .execute(&pool)
            .await
            .expect("旧项目行应可插入");

            let projects = list_projects(&pool, None).await.expect("查询应成功");
            assert_eq!(
                projects[0].remote_url.as_deref(),
                Some("https://github.com/acme/app.git")
            );
        });
    }

    #[test]
    fn touch_opened_updates_project_and_prunes_recent_items() {
        run_async(async {
            let pool = test_pool().await;
            migrate(&pool).await.expect("迁移应成功");

            for index in 0..21 {
                let repo = create_git_repo();
                let (project, already_exists) = add_project(
                    &pool,
                    repo.to_string_lossy().into_owned(),
                    Some(format!("repo-{index}")),
                    None,
                    None,
                    None,
                )
                .await
                .expect("Git 仓库应可登记");
                assert!(!already_exists);

                touch_opened(&pool, &project.id)
                    .await
                    .expect("打开记录应成功");
            }

            let recent = list_recent(&pool, Some(30))
                .await
                .expect("最近项目应可查询");

            assert_eq!(recent.len(), 20);
        });
    }

    #[test]
    fn remove_recent_deletes_history_but_keeps_project() {
        run_async(async {
            let pool = test_pool().await;
            migrate(&pool).await.expect("迁移应成功");
            let repo = create_git_repo();
            let (project, _) = add_project(
                &pool,
                repo.to_string_lossy().into_owned(),
                None,
                None,
                None,
                None,
            )
            .await
            .expect("Git 仓库应可登记");
            touch_opened(&pool, &project.id)
                .await
                .expect("打开记录应成功");
            assert_eq!(
                list_recent(&pool, None)
                    .await
                    .expect("最近项目应可查询")
                    .len(),
                1
            );

            remove_recent(&pool, &project.id)
                .await
                .expect("移除最近记录应成功");

            assert!(list_recent(&pool, None)
                .await
                .expect("最近项目应可查询")
                .is_empty());
            assert!(list_projects(&pool, None)
                .await
                .expect("项目列表应可查询")
                .iter()
                .any(|item| item.id == project.id));
        });
    }

    #[test]
    fn reorder_projects_and_workspaces_persists_order_and_rolls_back_invalid_items() {
        run_async(async {
            let pool = test_pool().await;
            migrate(&pool).await.expect("迁移应成功");
            let first_workspace = create_workspace(&pool, "第一组".to_string(), None, None, None)
                .await
                .expect("分组应可创建");
            let second_workspace = create_workspace(&pool, "第二组".to_string(), None, None, None)
                .await
                .expect("分组应可创建");
            let timestamp = now();
            for (id, workspace_id, name) in [
                ("project-a", Some(first_workspace.id.as_str()), "A"),
                ("project-b", Some(first_workspace.id.as_str()), "B"),
            ] {
                sqlx::query(
                    "INSERT INTO projects (id, workspace_id, name, path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                )
                .bind(id)
                .bind(workspace_id)
                .bind(name)
                .bind(format!("/tmp/{id}"))
                .bind(&timestamp)
                .execute(&pool)
                .await
                .expect("项目应可创建");
            }

            reorder_projects_and_workspaces(
                &pool,
                vec![
                    WorkspaceOrderItem {
                        id: second_workspace.id.clone(),
                        sort_order: 0,
                    },
                    WorkspaceOrderItem {
                        id: first_workspace.id.clone(),
                        sort_order: 1,
                    },
                ],
                vec![
                    ProjectOrderItem {
                        id: "project-b".to_string(),
                        workspace_id: Some(second_workspace.id.clone()),
                        sort_order: 0,
                    },
                    ProjectOrderItem {
                        id: "project-a".to_string(),
                        workspace_id: Some(second_workspace.id.clone()),
                        sort_order: 1,
                    },
                ],
            )
            .await
            .expect("重排应成功");

            let workspaces = list_workspaces(&pool).await.expect("分组应可查询");
            let projects = list_projects(&pool, Some(&second_workspace.id))
                .await
                .expect("项目应可查询");
            assert_eq!(workspaces[0].id, second_workspace.id);
            assert_eq!(
                projects
                    .iter()
                    .map(|project| project.id.as_str())
                    .collect::<Vec<_>>(),
                ["project-b", "project-a"]
            );

            let error = reorder_projects_and_workspaces(
                &pool,
                vec![],
                vec![ProjectOrderItem {
                    id: "missing".to_string(),
                    workspace_id: None,
                    sort_order: 0,
                }],
            )
            .await
            .expect_err("不存在的项目应失败");
            assert_eq!(error.code, "NOT_FOUND");
            let projects_after_error = list_projects(&pool, Some(&second_workspace.id))
                .await
                .expect("项目应可查询");
            assert_eq!(
                projects_after_error
                    .iter()
                    .map(|project| project.id.as_str())
                    .collect::<Vec<_>>(),
                ["project-b", "project-a"]
            );
        });
    }
}
