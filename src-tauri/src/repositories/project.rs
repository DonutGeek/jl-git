use sqlx::{PgPool, Postgres, Row};

use crate::error::AppError;
use crate::models::project::ProjectRow;

const PROJECT_COLUMNS: &str = "id, workspace_id, name, description, icon, path, remote_url, last_opened_at, pinned, sort_order, created_at, updated_at";

/// 新增项目；`sort_order` 取同分组内最大值 +1。
/// 唯一约束冲突由调用方按 `is_unique_violation` 判定，这里原样上抛。
#[allow(clippy::too_many_arguments)]
pub async fn insert<'e, E>(
    executor: E,
    id: &str,
    workspace_id: Option<&str>,
    name: &str,
    description: Option<&str>,
    icon: &str,
    path: &str,
    remote_url: Option<&str>,
    timestamp: &str,
) -> Result<(), sqlx::Error>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    sqlx::query(
        r#"
        INSERT INTO projects (id, workspace_id, name, description, icon, path, remote_url, pinned, sort_order, created_at, updated_at)
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, FALSE,
          COALESCE((SELECT MAX(sort_order) + 1 FROM projects WHERE workspace_id IS NOT DISTINCT FROM $2), 0),
          $8, $8
        )
        "#,
    )
    .bind(id)
    .bind(workspace_id)
    .bind(name)
    .bind(description)
    .bind(icon)
    .bind(path)
    .bind(remote_url)
    .bind(timestamp)
    .execute(executor)
    .await
    .map(|_| ())
}

pub async fn list(
    pool: &PgPool,
    workspace_id: Option<&str>,
) -> Result<Vec<ProjectRow>, AppError> {
    // ORDER BY 用 LOWER(name) 取代 SQLite 的 COLLATE NOCASE
    let rows = match workspace_id {
        Some(workspace_id) => sqlx::query(&format!(
            "SELECT {PROJECT_COLUMNS} FROM projects WHERE workspace_id = $1
             ORDER BY pinned DESC, sort_order ASC, LOWER(name) ASC"
        ))
        .bind(workspace_id)
        .fetch_all(pool)
        .await?,
        None => sqlx::query(&format!(
            "SELECT {PROJECT_COLUMNS} FROM projects
             ORDER BY pinned DESC, sort_order ASC, LOWER(name) ASC"
        ))
        .fetch_all(pool)
        .await?,
    };

    rows.into_iter().map(row_to_project).collect()
}

pub async fn find_by_path<'e, E>(
    executor: E,
    path: &str,
) -> Result<Option<ProjectRow>, AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    let row = sqlx::query(&format!(
        "SELECT {PROJECT_COLUMNS} FROM projects WHERE path = $1"
    ))
    .bind(path)
    .fetch_optional(executor)
    .await?;

    row.map(row_to_project).transpose()
}

pub async fn get_by_path(pool: &PgPool, path: &str) -> Result<ProjectRow, AppError> {
    find_by_path(pool, path)
        .await?
        .ok_or_else(|| AppError::new("NOT_FOUND", "项目不存在"))
}

pub async fn get_by_id(pool: &PgPool, id: &str) -> Result<ProjectRow, AppError> {
    let row = sqlx::query(&format!(
        "SELECT {PROJECT_COLUMNS} FROM projects WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::new("NOT_FOUND", "项目不存在"))?;

    row_to_project(row)
}

pub async fn exists<'e, E>(executor: E, id: &str) -> Result<bool, AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(1) FROM projects WHERE id = $1")
        .bind(id)
        .fetch_one(executor)
        .await?;
    Ok(count > 0)
}

pub async fn workspace_id_of<'e, E>(
    executor: E,
    id: &str,
) -> Result<Option<Option<String>>, AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    Ok(
        sqlx::query_scalar::<_, Option<String>>("SELECT workspace_id FROM projects WHERE id = $1")
            .bind(id)
            .fetch_optional(executor)
            .await?,
    )
}

pub async fn path_of(pool: &PgPool, id: &str) -> Result<Option<String>, AppError> {
    Ok(
        sqlx::query_scalar::<_, String>("SELECT path FROM projects WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?,
    )
}

pub async fn delete(pool: &PgPool, id: &str) -> Result<u64, AppError> {
    Ok(sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected())
}

/// 字段补丁式更新：布尔开关标明该字段是否参与更新，避免为每种组合写一条 SQL。
#[allow(clippy::too_many_arguments)]
pub async fn update_fields(
    pool: &PgPool,
    id: &str,
    name: Option<&str>,
    change_workspace: bool,
    workspace_id: Option<&str>,
    change_description: bool,
    description: Option<&str>,
    icon: Option<&str>,
    path: Option<&str>,
    remote_url: Option<&str>,
    timestamp: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE projects
        SET name = COALESCE($1, name),
            workspace_id = CASE WHEN $2 THEN $3 ELSE workspace_id END,
            description = CASE WHEN $4 THEN $5 ELSE description END,
            icon = COALESCE($6, icon),
            path = COALESCE($7, path),
            remote_url = CASE WHEN $8 THEN COALESCE($9, remote_url) ELSE remote_url END,
            updated_at = $10
        WHERE id = $11
        "#,
    )
    .bind(name)
    .bind(change_workspace)
    .bind(workspace_id)
    .bind(change_description)
    .bind(description)
    .bind(icon)
    .bind(path)
    .bind(path.is_some())
    .bind(remote_url)
    .bind(timestamp)
    .bind(id)
    .execute(pool)
    .await
    .map(|result| result.rows_affected())
}

pub async fn set_remote_url(pool: &PgPool, id: &str, remote_url: &str) -> Result<(), AppError> {
    sqlx::query("UPDATE projects SET remote_url = $1 WHERE id = $2")
        .bind(remote_url)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 记录打开时间；`remote_url` 为 None 时保留原值。
pub async fn touch_opened<'e, E>(
    executor: E,
    id: &str,
    timestamp: &str,
    remote_url: Option<&str>,
) -> Result<u64, AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    Ok(sqlx::query(
        r#"
        UPDATE projects
        SET last_opened_at = $1, updated_at = $1, remote_url = COALESCE($2, remote_url)
        WHERE id = $3
        "#,
    )
    .bind(timestamp)
    .bind(remote_url)
    .bind(id)
    .execute(executor)
    .await?
    .rows_affected())
}

pub async fn set_sort_order<'e, E>(
    executor: E,
    id: &str,
    workspace_id: Option<&str>,
    sort_order: i64,
    timestamp: &str,
) -> Result<(), AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    sqlx::query(
        "UPDATE projects SET workspace_id = $1, sort_order = $2, updated_at = $3 WHERE id = $4",
    )
    .bind(workspace_id)
    .bind(sort_order)
    .bind(timestamp)
    .bind(id)
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn detach_workspace<'e, E>(executor: E, workspace_id: &str) -> Result<(), AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    sqlx::query("UPDATE projects SET workspace_id = NULL WHERE workspace_id = $1")
        .bind(workspace_id)
        .execute(executor)
        .await?;
    Ok(())
}

pub async fn delete_all(pool: &PgPool) -> Result<(), AppError> {
    sqlx::query("DELETE FROM projects").execute(pool).await?;
    Ok(())
}

fn row_to_project(row: sqlx::postgres::PgRow) -> Result<ProjectRow, AppError> {
    Ok(ProjectRow {
        id: row.try_get("id")?,
        workspace_id: row.try_get("workspace_id")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        icon: row.try_get("icon")?,
        path: row.try_get("path")?,
        remote_url: row.try_get("remote_url")?,
        last_opened_at: row.try_get("last_opened_at")?,
        pinned: row.try_get("pinned")?,
        sort_order: row.try_get("sort_order")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
