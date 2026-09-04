use sqlx::{PgPool, Postgres, Row};

use crate::error::AppError;
use crate::models::workspace::WorkspaceRow;

const WORKSPACE_COLUMNS: &str =
    "id, parent_id, name, icon, color, locked, sort_order, created_at, updated_at";

pub async fn list(pool: &PgPool) -> Result<Vec<WorkspaceRow>, AppError> {
    let rows = sqlx::query(&format!(
        "SELECT {WORKSPACE_COLUMNS} FROM workspaces ORDER BY sort_order, LOWER(name)"
    ))
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(row_to_workspace).collect()
}

pub async fn get(pool: &PgPool, id: &str) -> Result<WorkspaceRow, AppError> {
    let row = sqlx::query(&format!(
        "SELECT {WORKSPACE_COLUMNS} FROM workspaces WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::new("NOT_FOUND", "分组不存在"))?;

    row_to_workspace(row)
}

pub async fn insert(
    pool: &PgPool,
    id: &str,
    parent_id: Option<&str>,
    name: &str,
    icon: &str,
    color: &str,
    timestamp: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO workspaces (id, parent_id, name, icon, color, locked, sort_order, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, FALSE, 0, $6, $6)
        "#,
    )
    .bind(id)
    .bind(parent_id)
    .bind(name)
    .bind(icon)
    .bind(color)
    .bind(timestamp)
    .execute(pool)
    .await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn update_fields(
    pool: &PgPool,
    id: &str,
    name: Option<&str>,
    change_parent: bool,
    parent_id: Option<&str>,
    icon: Option<&str>,
    color: Option<&str>,
    locked: Option<bool>,
    timestamp: &str,
) -> Result<u64, AppError> {
    Ok(sqlx::query(
        r#"
        UPDATE workspaces
        SET name = COALESCE($1, name),
            parent_id = CASE WHEN $2 THEN $3 ELSE parent_id END,
            icon = COALESCE($4, icon),
            color = COALESCE($5, color),
            locked = COALESCE($6, locked),
            updated_at = $7
        WHERE id = $8
        "#,
    )
    .bind(name)
    .bind(change_parent)
    .bind(parent_id)
    .bind(icon)
    .bind(color)
    .bind(locked)
    .bind(timestamp)
    .bind(id)
    .execute(pool)
    .await?
    .rows_affected())
}

pub async fn exists<'e, E>(executor: E, id: &str) -> Result<bool, AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(1) FROM workspaces WHERE id = $1")
        .bind(id)
        .fetch_one(executor)
        .await?;
    Ok(count > 0)
}

/// 分组不存在时视为未锁定，交给上层的存在性校验去报错。
pub async fn is_locked<'e, E>(executor: E, id: &str) -> Result<bool, AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    Ok(
        sqlx::query_scalar::<_, bool>("SELECT locked FROM workspaces WHERE id = $1")
            .bind(id)
            .fetch_optional(executor)
            .await?
            .unwrap_or(false),
    )
}

pub async fn parent_of<'e, E>(executor: E, id: &str) -> Result<Option<String>, AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    Ok(
        sqlx::query_scalar::<_, Option<String>>("SELECT parent_id FROM workspaces WHERE id = $1")
            .bind(id)
            .fetch_optional(executor)
            .await?
            .flatten(),
    )
}

pub async fn delete<'e, E>(executor: E, id: &str) -> Result<u64, AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    Ok(sqlx::query("DELETE FROM workspaces WHERE id = $1")
        .bind(id)
        .execute(executor)
        .await?
        .rows_affected())
}

/// 删组后把直接子组升为根组
pub async fn promote_children_to_root<'e, E>(executor: E, id: &str) -> Result<(), AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    sqlx::query("UPDATE workspaces SET parent_id = NULL WHERE parent_id = $1")
        .bind(id)
        .execute(executor)
        .await?;
    Ok(())
}

pub async fn set_sort_order<'e, E>(
    executor: E,
    id: &str,
    sort_order: i64,
    timestamp: &str,
) -> Result<(), AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    sqlx::query("UPDATE workspaces SET sort_order = $1, updated_at = $2 WHERE id = $3")
        .bind(sort_order)
        .bind(timestamp)
        .bind(id)
        .execute(executor)
        .await?;
    Ok(())
}

pub async fn delete_all(pool: &PgPool) -> Result<(), AppError> {
    sqlx::query("DELETE FROM workspaces").execute(pool).await?;
    Ok(())
}

fn row_to_workspace(row: sqlx::postgres::PgRow) -> Result<WorkspaceRow, AppError> {
    let stored_color: String = row.try_get("color")?;
    Ok(WorkspaceRow {
        id: row.try_get("id")?,
        parent_id: row.try_get("parent_id")?,
        name: row.try_get("name")?,
        icon: row.try_get("icon")?,
        // 早期库存的是 blue/green 等名字，读出时统一转 HEX
        color: crate::services::workspace::normalize_color(&stored_color).unwrap_or_default(),
        locked: row.try_get("locked")?,
        sort_order: row.try_get("sort_order")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
