use sqlx::{PgPool, Postgres, Row};

use crate::error::AppError;
use crate::models::chat::{ChatMessageRow, ChatMessageWrite, CHAT_SCOPE_AGENT};

/// 会话主体（不含消息）
pub struct ConversationHead {
    pub id: String,
    pub scope: String,
    pub project_id: Option<String>,
    pub title: String,
    pub pinned: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

const CONVERSATION_COLUMNS: &str =
    "id, scope, project_id, title, pinned, sort_order, created_at, updated_at";

pub async fn list_heads(
    pool: &PgPool,
    scope: &str,
    project_id: Option<&str>,
) -> Result<Vec<ConversationHead>, AppError> {
    // 单仓会话按 project_id 精确匹配，多仓会话要求 project_id 为 NULL
    let rows = if scope == CHAT_SCOPE_AGENT {
        sqlx::query(&format!(
            "SELECT {CONVERSATION_COLUMNS} FROM chat_conversations
             WHERE scope = $1 AND project_id = $2
             ORDER BY pinned DESC, sort_order ASC, updated_at DESC"
        ))
        .bind(scope)
        .bind(project_id)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query(&format!(
            "SELECT {CONVERSATION_COLUMNS} FROM chat_conversations
             WHERE scope = $1 AND project_id IS NULL
             ORDER BY pinned DESC, sort_order ASC, updated_at DESC"
        ))
        .bind(scope)
        .fetch_all(pool)
        .await?
    };

    rows.into_iter()
        .map(|row| {
            Ok(ConversationHead {
                id: row.try_get("id")?,
                scope: row.try_get("scope")?,
                project_id: row.try_get("project_id")?,
                title: row.try_get("title")?,
                pinned: row.try_get("pinned")?,
                sort_order: row.try_get("sort_order")?,
                created_at: row.try_get("created_at")?,
                updated_at: row.try_get("updated_at")?,
            })
        })
        .collect()
}

pub async fn list_messages(
    pool: &PgPool,
    conversation_id: &str,
) -> Result<Vec<ChatMessageRow>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT id, role, content, reasoning_content, reasoning_duration_ms, mentions_json, created_at
        FROM chat_messages
        WHERE conversation_id = $1
        ORDER BY sort_order ASC, created_at ASC
        "#,
    )
    .bind(conversation_id)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(ChatMessageRow {
                id: row.try_get("id")?,
                role: row.try_get("role")?,
                content: row.try_get("content")?,
                created_at: row.try_get("created_at")?,
                reasoning_content: row.try_get("reasoning_content")?,
                reasoning_duration_ms: row.try_get("reasoning_duration_ms")?,
                mentions_json: row.try_get("mentions_json")?,
            })
        })
        .collect()
}

pub async fn find_sort_order<'e, E>(executor: E, id: &str) -> Result<Option<i64>, AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    Ok(
        sqlx::query_scalar::<_, i64>("SELECT sort_order FROM chat_conversations WHERE id = $1")
            .bind(id)
            .fetch_optional(executor)
            .await?,
    )
}

/// 同 scope（+ 项目）下的下一个排序值
pub async fn next_sort_order<'e, E>(
    executor: E,
    scope: &str,
    project_id: Option<&str>,
) -> Result<i64, AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    let max = if scope == CHAT_SCOPE_AGENT {
        sqlx::query_scalar::<_, i64>(
            "SELECT COALESCE(MAX(sort_order), -1) FROM chat_conversations
             WHERE scope = $1 AND project_id = $2",
        )
        .bind(scope)
        .bind(project_id)
        .fetch_one(executor)
        .await?
    } else {
        sqlx::query_scalar::<_, i64>(
            "SELECT COALESCE(MAX(sort_order), -1) FROM chat_conversations
             WHERE scope = $1 AND project_id IS NULL",
        )
        .bind(scope)
        .fetch_one(executor)
        .await?
    };
    Ok(max + 1)
}

#[allow(clippy::too_many_arguments)]
pub async fn upsert_head<'e, E>(
    executor: E,
    id: &str,
    scope: &str,
    project_id: Option<&str>,
    title: &str,
    pinned: bool,
    sort_order: i64,
    created_at: &str,
    updated_at: &str,
) -> Result<(), AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    sqlx::query(
        r#"
        INSERT INTO chat_conversations (id, scope, project_id, title, pinned, sort_order, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          scope = EXCLUDED.scope,
          project_id = EXCLUDED.project_id,
          title = EXCLUDED.title,
          pinned = EXCLUDED.pinned,
          updated_at = EXCLUDED.updated_at
        "#,
    )
    .bind(id)
    .bind(scope)
    .bind(project_id)
    .bind(title)
    .bind(pinned)
    .bind(sort_order)
    .bind(created_at)
    .bind(updated_at)
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn delete_messages<'e, E>(executor: E, conversation_id: &str) -> Result<(), AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    sqlx::query("DELETE FROM chat_messages WHERE conversation_id = $1")
        .bind(conversation_id)
        .execute(executor)
        .await?;
    Ok(())
}

pub async fn insert_message<'e, E>(
    executor: E,
    conversation_id: &str,
    message: &ChatMessageWrite,
    sort_order: i64,
) -> Result<(), AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    sqlx::query(
        r#"
        INSERT INTO chat_messages (
          id, conversation_id, role, content, reasoning_content,
          reasoning_duration_ms, mentions_json, created_at, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(&message.id)
    .bind(conversation_id)
    .bind(&message.role)
    .bind(&message.content)
    .bind(&message.reasoning_content)
    .bind(message.reasoning_duration_ms)
    .bind(&message.mentions_json)
    .bind(&message.created_at)
    .bind(sort_order)
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn delete_conversation(pool: &PgPool, id: &str) -> Result<u64, AppError> {
    Ok(sqlx::query("DELETE FROM chat_conversations WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected())
}

/// 重排单条会话；范围不匹配时 `rows_affected` 为 0，由上层报错。
pub async fn set_sort_order<'e, E>(
    executor: E,
    id: &str,
    scope: &str,
    project_id: Option<&str>,
    sort_order: i64,
    timestamp: &str,
) -> Result<u64, AppError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    let result = if scope == CHAT_SCOPE_AGENT {
        sqlx::query(
            r#"
            UPDATE chat_conversations SET sort_order = $1, updated_at = $2
            WHERE id = $3 AND scope = $4 AND project_id = $5
            "#,
        )
        .bind(sort_order)
        .bind(timestamp)
        .bind(id)
        .bind(scope)
        .bind(project_id)
        .execute(executor)
        .await?
    } else {
        sqlx::query(
            r#"
            UPDATE chat_conversations SET sort_order = $1, updated_at = $2
            WHERE id = $3 AND scope = $4 AND project_id IS NULL
            "#,
        )
        .bind(sort_order)
        .bind(timestamp)
        .bind(id)
        .bind(scope)
        .execute(executor)
        .await?
    };
    Ok(result.rows_affected())
}

pub async fn delete_by_scope(pool: &PgPool, scope: &str) -> Result<(), AppError> {
    sqlx::query("DELETE FROM chat_conversations WHERE scope = $1")
        .bind(scope)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_all(pool: &PgPool) -> Result<(), AppError> {
    sqlx::query("DELETE FROM chat_conversations")
        .execute(pool)
        .await?;
    Ok(())
}
