use chrono::Utc;
use serde::Serialize;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Row, SqlitePool,
};
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::git::path::{normalize_existing_dir, require_git_toplevel};

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
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
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
          icon TEXT NOT NULL DEFAULT 'folder-git-2',
          color TEXT NOT NULL DEFAULT 'blue',
          path TEXT NOT NULL UNIQUE,
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
        sqlx::query(
            "ALTER TABLE projects ADD COLUMN icon TEXT NOT NULL DEFAULT 'folder-git-2'",
        )
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
    for (column, definition) in [("icon", "TEXT NOT NULL DEFAULT 'folder'"), ("color", "TEXT NOT NULL DEFAULT 'blue'")] {
        let exists = workspace_columns.iter().any(|item| item.try_get::<String, _>("name").map(|name| name == column).unwrap_or(false));
        if !exists { sqlx::query(&format!("ALTER TABLE workspaces ADD COLUMN {column} {definition}")).execute(pool).await.map_err(to_db_error)?; }
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

    Ok(())
}

pub async fn add_project(
    pool: &SqlitePool,
    path: String,
    name: Option<String>,
    workspace_id: Option<String>,
    description: Option<String>,
    icon: Option<String>,
) -> Result<ProjectRow, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let display_name = resolve_project_name(&repo_path, name)?;
    let description = normalize_description(description);
    let has_explicit_icon = icon.is_some();
    let icon = normalize_project_icon(icon)?;
    let timestamp = now();
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT INTO projects (id, workspace_id, name, description, icon, path, pinned, sort_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, COALESCE((SELECT MAX(sort_order) + 1 FROM projects WHERE workspace_id IS ?2), 0), ?7, ?7)
        ON CONFLICT(path) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          name = excluded.name,
          description = excluded.description,
          icon = CASE WHEN ?8 THEN excluded.icon ELSE projects.icon END,
          updated_at = excluded.updated_at
        "#,
    )
    .bind(id)
    .bind(workspace_id)
    .bind(display_name)
    .bind(&description)
    .bind(icon)
    .bind(path_to_string(&repo_path))
    .bind(timestamp)
    .bind(has_explicit_icon)
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    get_project_by_path(pool, &path_to_string(&repo_path)).await
}

pub async fn list_projects(
    pool: &SqlitePool,
    workspace_id: Option<&str>,
) -> Result<Vec<ProjectRow>, AppError> {
    let rows = if let Some(workspace_id) = workspace_id {
        sqlx::query(
            r#"
            SELECT id, workspace_id, name, description, icon, path, last_opened_at, pinned, sort_order, created_at, updated_at
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
            SELECT id, workspace_id, name, description, icon, path, last_opened_at, pinned, sort_order, created_at, updated_at
            FROM projects
            ORDER BY pinned DESC, sort_order ASC, name COLLATE NOCASE ASC
            "#,
        )
        .fetch_all(pool)
        .await
        .map_err(to_db_error)?
    };

    rows.into_iter().map(row_to_project).collect()
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
) -> Result<ProjectRow, AppError> {
    if id.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "项目 ID 不能为空"));
    }

    let name = name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let description = description.map(normalize_description);
    let icon = icon.map(|value| normalize_project_icon(Some(value))).transpose()?;
    if name.is_none() && workspace_id.is_none() && description.is_none() && icon.is_none() {
        return Err(AppError::new("VALIDATION", "没有可更新的项目字段"));
    }

    let timestamp = now();
    let result = sqlx::query(
        r#"
        UPDATE projects
        SET name = COALESCE(?1, name),
            workspace_id = CASE WHEN ?2 THEN ?3 ELSE workspace_id END,
            description = CASE WHEN ?4 THEN ?5 ELSE description END,
            icon = COALESCE(?6, icon),
            updated_at = ?7
        WHERE id = ?8
        "#,
    )
    .bind(&name)
    .bind(workspace_id.is_some())
    .bind(workspace_id.flatten())
    .bind(description.is_some())
    .bind(description.flatten())
    .bind(icon)
    .bind(&timestamp)
    .bind(id)
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::new("NOT_FOUND", "项目不存在"));
    }

    get_project_by_id(pool, id).await
}

pub async fn list_workspaces(pool: &SqlitePool) -> Result<Vec<WorkspaceRow>, AppError> {
    sqlx::query(
        "SELECT id, parent_id, name, icon, color, sort_order, created_at, updated_at FROM workspaces ORDER BY sort_order, name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await
    .map_err(to_db_error)?
    .into_iter()
    .map(row_to_workspace)
    .collect()
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
    let icon = icon.unwrap_or_else(|| "code".to_string());
    let color = color.unwrap_or_else(|| "blue".to_string());
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
        "INSERT INTO workspaces (id, parent_id, name, icon, color, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)",
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
) -> Result<WorkspaceRow, AppError> {
    let name = name.map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
    if name.is_none() && parent_id.is_none() && icon.is_none() && color.is_none() {
        return Err(AppError::new("VALIDATION", "没有可更新的分组字段"));
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
        let mut current = Some(parent_id.clone());
        while let Some(cursor) = current {
            if cursor == id {
                return Err(AppError::new("VALIDATION", "不能将分组移动到其子分组下"));
            }
            current = sqlx::query_scalar::<_, Option<String>>("SELECT parent_id FROM workspaces WHERE id = ?1")
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
             updated_at = ?6
         WHERE id = ?7",
    )
    .bind(&name)
    .bind(parent_id.is_some())
    .bind(parent_id.clone().flatten())
    .bind(&icon)
    .bind(&color)
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
        if let Some(workspace_id) = &project.workspace_id {
            let workspace_exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(1) FROM workspaces WHERE id = ?1")
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
        sqlx::query("UPDATE projects SET workspace_id = ?1, sort_order = ?2, updated_at = ?3 WHERE id = ?4")
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
        "SELECT id, parent_id, name, icon, color, sort_order, created_at, updated_at FROM workspaces WHERE id = ?1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(to_db_error)?;

    row_to_workspace(row)
}

fn row_to_workspace(row: sqlx::sqlite::SqliteRow) -> Result<WorkspaceRow, AppError> {
    Ok(WorkspaceRow {
        id: row.try_get("id").map_err(to_db_error)?,
        parent_id: row.try_get("parent_id").map_err(to_db_error)?,
        name: row.try_get("name").map_err(to_db_error)?,
        icon: row.try_get("icon").map_err(to_db_error)?,
        color: row.try_get("color").map_err(to_db_error)?,
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
    let mut tx = pool.begin().await.map_err(to_db_error)?;
    let result = sqlx::query(
        r#"
        UPDATE projects
        SET last_opened_at = ?1, updated_at = ?1
        WHERE id = ?2
        "#,
    )
    .bind(&timestamp)
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

async fn get_project_by_path(pool: &SqlitePool, path: &str) -> Result<ProjectRow, AppError> {
    let row = sqlx::query(
        r#"
        SELECT id, workspace_id, name, description, icon, path, last_opened_at, pinned, sort_order, created_at, updated_at
        FROM projects
        WHERE path = ?1
        "#,
    )
    .bind(path)
    .fetch_optional(pool)
    .await
    .map_err(to_db_error)?
    .ok_or_else(|| AppError::new("NOT_FOUND", "项目不存在"))?;

    row_to_project(row)
}

async fn get_project_by_id(pool: &SqlitePool, id: &str) -> Result<ProjectRow, AppError> {
    let row = sqlx::query(
        r#"
        SELECT id, workspace_id, name, description, icon, path, last_opened_at, pinned, sort_order, created_at, updated_at
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

fn normalize_project_icon(value: Option<String>) -> Result<String, AppError> {
    const DEFAULT_PROJECT_ICON: &str = "folder-git-2";
    const PROJECT_ICONS: &[&str] = &[
        DEFAULT_PROJECT_ICON,
        "folder",
        "code-2",
        "terminal",
        "braces",
        "box",
        "package",
        "layers-3",
        "database",
        "server",
        "globe-2",
        "cloud",
        "cpu",
        "app-window",
        "smartphone",
        "gamepad-2",
        "bot",
        "sparkles",
        "briefcase-business",
        "book-open",
    ];

    let icon = value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| DEFAULT_PROJECT_ICON.to_string());
    if !PROJECT_ICONS.contains(&icon.as_str()) {
        return Err(AppError::new("VALIDATION", "不支持的项目图标"));
    }
    Ok(icon)
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

            assert!(column_names.contains(&"icon".to_string()), "项目表应支持图标");
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

            assert!(column_names.contains(&"parent_id".to_string()), "分组表应支持父分组 ID");
            assert!(column_names.contains(&"icon".to_string()), "分组表应支持图标");
            assert!(column_names.contains(&"color".to_string()), "分组表应支持颜色");
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
            let child = create_workspace(&pool, "小程序".to_string(), Some(root.id.clone()), None, None)
                .await
                .expect("子分组应可创建");

            assert_eq!(child.parent_id.as_deref(), Some(root.id.as_str()));
        });
    }

    #[test]
    fn add_project_normalizes_git_repo_and_upserts_existing_path() {
        run_async(async {
            let pool = test_pool().await;
            migrate(&pool).await.expect("迁移应成功");
            let repo = create_git_repo();

            let first = add_project(
                &pool,
                repo.to_string_lossy().into_owned(),
                None,
                None,
                None,
                None,
            )
                .await
                .expect("Git 仓库应可登记");
            assert_eq!(first.icon, "folder-git-2");
            let second = add_project(
                &pool,
                repo.to_string_lossy().into_owned(),
                Some("Renamed".to_string()),
                None,
                None,
                Some("rocket".to_string()),
            )
            .await
            .expect_err("不支持的项目图标应被拒绝");
            assert_eq!(second.code, "VALIDATION");

            let second = add_project(
                &pool,
                repo.to_string_lossy().into_owned(),
                Some("Renamed".to_string()),
                None,
                None,
                Some("terminal".to_string()),
            )
            .await
            .expect("重复路径应更新现有项目");

            assert_eq!(first.id, second.id);
            assert_eq!(second.name, "Renamed");
            assert_eq!(second.icon, "terminal");
            assert_eq!(second.path, repo.canonicalize().unwrap().to_string_lossy());
        });
    }

    #[test]
    fn touch_opened_updates_project_and_prunes_recent_items() {
        run_async(async {
            let pool = test_pool().await;
            migrate(&pool).await.expect("迁移应成功");

            for index in 0..21 {
                let repo = create_git_repo();
                let project = add_project(
                    &pool,
                    repo.to_string_lossy().into_owned(),
                    Some(format!("repo-{index}")),
                    None,
                    None,
                    None,
                )
                .await
                .expect("Git 仓库应可登记");

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
                    WorkspaceOrderItem { id: second_workspace.id.clone(), sort_order: 0 },
                    WorkspaceOrderItem { id: first_workspace.id.clone(), sort_order: 1 },
                ],
                vec![
                    ProjectOrderItem { id: "project-b".to_string(), workspace_id: Some(second_workspace.id.clone()), sort_order: 0 },
                    ProjectOrderItem { id: "project-a".to_string(), workspace_id: Some(second_workspace.id.clone()), sort_order: 1 },
                ],
            )
            .await
            .expect("重排应成功");

            let workspaces = list_workspaces(&pool).await.expect("分组应可查询");
            let projects = list_projects(&pool, Some(&second_workspace.id)).await.expect("项目应可查询");
            assert_eq!(workspaces[0].id, second_workspace.id);
            assert_eq!(projects.iter().map(|project| project.id.as_str()).collect::<Vec<_>>(), ["project-b", "project-a"]);

            let error = reorder_projects_and_workspaces(
                &pool,
                vec![],
                vec![ProjectOrderItem { id: "missing".to_string(), workspace_id: None, sort_order: 0 }],
            )
            .await
            .expect_err("不存在的项目应失败");
            assert_eq!(error.code, "NOT_FOUND");
            let projects_after_error = list_projects(&pool, Some(&second_workspace.id)).await.expect("项目应可查询");
            assert_eq!(projects_after_error.iter().map(|project| project.id.as_str()).collect::<Vec<_>>(), ["project-b", "project-a"]);
        });
    }
}
