use sqlx::{PgPool, Postgres, Row};

use crate::error::AppError;
use crate::models::project::RecentProjectItem;

/// 最近打开保留条数
pub const RECENT_KEEP: i64 = 20;

pub async fn upsert<'e, E>(executor: E, project_id: &str, timestamp: &str) -> Result<(), AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    sqlx::query(
        r#"
        INSERT INTO recent_projects (project_id, opened_at, open_count)
        VALUES ($1, $2, 1)
        ON CONFLICT (project_id) DO UPDATE SET
          opened_at = EXCLUDED.opened_at,
          open_count = recent_projects.open_count + 1
        "#,
    )
    .bind(project_id)
    .bind(timestamp)
    .execute(executor)
    .await?;
    Ok(())
}

/// 只保留最近 `RECENT_KEEP` 条；PG 用 `OFFSET` 而非 SQLite 的 `LIMIT -1 OFFSET n`。
pub async fn prune<'e, E>(executor: E) -> Result<(), AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    sqlx::query(
        r#"
        DELETE FROM recent_projects
        WHERE project_id IN (
          SELECT project_id
          FROM recent_projects
          ORDER BY opened_at DESC
          OFFSET $1
        )
        "#,
    )
    .bind(RECENT_KEEP)
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn list(pool: &PgPool, limit: i64) -> Result<Vec<RecentProjectItem>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT project_id, opened_at
        FROM recent_projects
        ORDER BY opened_at DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(RecentProjectItem {
                project_id: row.try_get("project_id")?,
                opened_at: row.try_get("opened_at")?,
            })
        })
        .collect()
}

pub async fn delete(pool: &PgPool, project_id: &str) -> Result<(), AppError> {
    sqlx::query("DELETE FROM recent_projects WHERE project_id = $1")
        .bind(project_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_all(pool: &PgPool) -> Result<(), AppError> {
    sqlx::query("DELETE FROM recent_projects")
        .execute(pool)
        .await?;
    Ok(())
}
