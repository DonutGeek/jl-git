use chrono::Utc;
use serde::Serialize;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Row, SqlitePool,
};
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::git::path::{normalize_existing_dir, require_git_toplevel};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub workspace_id: Option<String>,
    pub name: String,
    pub path: String,
    pub last_opened_at: Option<String>,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentProjectItem {
    pub project_id: String,
    pub opened_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRow { pub id: String, pub name: String, pub sort_order: i64, pub created_at: String, pub updated_at: String }

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
          path TEXT NOT NULL UNIQUE,
          last_opened_at TEXT NULL,
          pinned INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
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

    Ok(())
}

pub async fn add_project(
    pool: &SqlitePool,
    path: String,
    name: Option<String>,
    workspace_id: Option<String>,
) -> Result<ProjectRow, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    let display_name = resolve_project_name(&repo_path, name)?;
    let timestamp = now();
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT INTO projects (id, workspace_id, name, path, pinned, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)
        ON CONFLICT(path) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          name = excluded.name,
          updated_at = excluded.updated_at
        "#,
    )
    .bind(id)
    .bind(workspace_id)
    .bind(display_name)
    .bind(path_to_string(&repo_path))
    .bind(timestamp)
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
            SELECT id, workspace_id, name, path, last_opened_at, pinned, created_at, updated_at
            FROM projects
            WHERE workspace_id = ?1
            ORDER BY pinned DESC, last_opened_at DESC, name COLLATE NOCASE ASC
            "#,
        )
        .bind(workspace_id)
        .fetch_all(pool)
        .await
        .map_err(to_db_error)?
    } else {
        sqlx::query(
            r#"
            SELECT id, workspace_id, name, path, last_opened_at, pinned, created_at, updated_at
            FROM projects
            ORDER BY pinned DESC, last_opened_at DESC, name COLLATE NOCASE ASC
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
    name: Option<String>, workspace_id: Option<Option<String>>,
) -> Result<ProjectRow, AppError> {
    if id.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "项目 ID 不能为空"));
    }

    let name = name.map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
    if name.is_none() && workspace_id.is_none() { return Err(AppError::new("VALIDATION", "没有可更新的项目字段")); }

    let timestamp = now();
    let result = sqlx::query(
        r#"
        UPDATE projects
        SET name = COALESCE(?1, name), workspace_id = CASE WHEN ?2 THEN ?3 ELSE workspace_id END, updated_at = ?4
        WHERE id = ?3
        "#,
    )
    .bind(&name).bind(workspace_id.is_some()).bind(workspace_id.flatten()).bind(&timestamp).bind(id)
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::new("NOT_FOUND", "项目不存在"));
    }

    get_project_by_id(pool, id).await
}

pub async fn list_workspaces(pool: &SqlitePool) -> Result<Vec<WorkspaceRow>, AppError> { sqlx::query("SELECT id, name, sort_order, created_at, updated_at FROM workspaces ORDER BY sort_order, name COLLATE NOCASE").fetch_all(pool).await.map_err(to_db_error)?.into_iter().map(row_to_workspace).collect() }
pub async fn create_workspace(pool: &SqlitePool, name: String) -> Result<WorkspaceRow, AppError> { let name=name.trim().to_string(); if name.is_empty(){return Err(AppError::new("VALIDATION","分组名称不能为空"));} let id=uuid::Uuid::new_v4().to_string(); let time=now(); sqlx::query("INSERT INTO workspaces (id,name,sort_order,created_at,updated_at) VALUES (?1,?2,0,?3,?3)").bind(&id).bind(name).bind(time).execute(pool).await.map_err(to_db_error)?; get_workspace(pool,&id).await }
pub async fn delete_workspace(pool: &SqlitePool, id: &str) -> Result<(), AppError> { let mut tx=pool.begin().await.map_err(to_db_error)?; let result=sqlx::query("UPDATE projects SET workspace_id = NULL WHERE workspace_id = ?1").bind(id).execute(&mut *tx).await.map_err(to_db_error)?; let _=result; let deleted=sqlx::query("DELETE FROM workspaces WHERE id = ?1").bind(id).execute(&mut *tx).await.map_err(to_db_error)?; if deleted.rows_affected()==0{return Err(AppError::new("NOT_FOUND","分组不存在"));} tx.commit().await.map_err(to_db_error)?; Ok(()) }
async fn get_workspace(pool:&SqlitePool,id:&str)->Result<WorkspaceRow,AppError>{let row=sqlx::query("SELECT id,name,sort_order,created_at,updated_at FROM workspaces WHERE id=?1").bind(id).fetch_one(pool).await.map_err(to_db_error)?;row_to_workspace(row)}
fn row_to_workspace(row:sqlx::sqlite::SqliteRow)->Result<WorkspaceRow,AppError>{Ok(WorkspaceRow{id:row.try_get("id").map_err(to_db_error)?,name:row.try_get("name").map_err(to_db_error)?,sort_order:row.try_get("sort_order").map_err(to_db_error)?,created_at:row.try_get("created_at").map_err(to_db_error)?,updated_at:row.try_get("updated_at").map_err(to_db_error)?})}

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
        SELECT id, workspace_id, name, path, last_opened_at, pinned, created_at, updated_at
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
        SELECT id, workspace_id, name, path, last_opened_at, pinned, created_at, updated_at
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
        path: row.try_get("path").map_err(to_db_error)?,
        last_opened_at: row.try_get("last_opened_at").map_err(to_db_error)?,
        pinned: pinned != 0,
        created_at: row.try_get("created_at").map_err(to_db_error)?,
        updated_at: row.try_get("updated_at").map_err(to_db_error)?,
    })
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

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn to_db_error(error: sqlx::Error) -> AppError {
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
    fn add_project_normalizes_git_repo_and_upserts_existing_path() {
        run_async(async {
            let pool = test_pool().await;
            migrate(&pool).await.expect("迁移应成功");
            let repo = create_git_repo();

            let first = add_project(&pool, repo.to_string_lossy().into_owned(), None, None)
                .await
                .expect("Git 仓库应可登记");
            let second = add_project(
                &pool,
                repo.to_string_lossy().into_owned(),
                Some("Renamed".to_string()),
                None,
            )
            .await
            .expect("重复路径应更新现有项目");

            assert_eq!(first.id, second.id);
            assert_eq!(second.name, "Renamed");
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
}
