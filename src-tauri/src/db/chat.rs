use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

use crate::error::AppError;

use super::{now, to_db_error};

pub const CHAT_SCOPE_AGENT: &str = "agent";
/// 多仓鲸灵（AgentHost = global）会话 scope
pub const CHAT_SCOPE_AGENT_GLOBAL: &str = "agent_global";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageRow {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_duration_ms: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mentions_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChatConversationRow {
    pub id: String,
    pub scope: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    pub title: String,
    pub pinned: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub messages: Vec<ChatMessageRow>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertChatConversationInput {
    pub scope: String,
    pub project_id: Option<String>,
    pub conversation: ChatConversationWrite,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatConversationWrite {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
    pub messages: Vec<ChatMessageWrite>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageWrite {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    #[serde(default)]
    pub reasoning_content: Option<String>,
    #[serde(default)]
    pub reasoning_duration_ms: Option<i64>,
    #[serde(default)]
    pub mentions_json: Option<String>,
}

pub async fn migrate_chat_tables(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS chat_conversations (
          id TEXT PRIMARY KEY,
          scope TEXT NOT NULL,
          project_id TEXT NULL REFERENCES projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL DEFAULT '',
          pinned INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          reasoning_content TEXT NULL,
          reasoning_duration_ms INTEGER NULL,
          mentions_json TEXT NULL,
          created_at TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_chat_conversations_scope_project
          ON chat_conversations(scope, project_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
          ON chat_messages(conversation_id, sort_order);
        "#,
    )
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    sqlx::query(
        r#"
        INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (4, ?1)
        "#,
    )
    .bind(now())
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    // schema v5：会话 scope resume_helper → jinglv（历史命名，已废弃）
    sqlx::query(
        r#"
        UPDATE chat_conversations
        SET scope = 'jinglv'
        WHERE scope = 'resume_helper'
        "#,
    )
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    sqlx::query(
        r#"
        INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (5, ?1)
        "#,
    )
    .bind(now())
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    // schema v6：会话 scope jinglv / resume_helper → agent_global（统一鲸灵：多仓命名）
    sqlx::query(
        r#"
        UPDATE chat_conversations
        SET scope = 'agent_global'
        WHERE scope IN ('jinglv', 'resume_helper')
        "#,
    )
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    sqlx::query(
        r#"
        INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (6, ?1)
        "#,
    )
    .bind(now())
    .execute(pool)
    .await
    .map_err(to_db_error)?;

    Ok(())
}

fn validate_scope_project(scope: &str, project_id: Option<&str>) -> Result<(), AppError> {
    match scope {
        CHAT_SCOPE_AGENT => {
            if project_id.map(str::trim).filter(|id| !id.is_empty()).is_none() {
                return Err(AppError::new("VALIDATION", "鲸灵会话必须绑定项目 ID"));
            }
            Ok(())
        }
        CHAT_SCOPE_AGENT_GLOBAL => {
            if project_id.is_some() {
                return Err(AppError::new("VALIDATION", "多仓鲸灵会话不应绑定项目 ID"));
            }
            Ok(())
        }
        _ => Err(AppError::new("VALIDATION", "未知的会话 scope")),
    }
}

pub async fn list_chat_conversations(
    pool: &SqlitePool,
    scope: &str,
    project_id: Option<&str>,
) -> Result<Vec<ChatConversationRow>, AppError> {
    validate_scope_project(scope, project_id)?;

    let rows = if scope == CHAT_SCOPE_AGENT {
        sqlx::query(
            r#"
            SELECT id, scope, project_id, title, pinned, sort_order, created_at, updated_at
            FROM chat_conversations
            WHERE scope = ?1 AND project_id = ?2
            ORDER BY pinned DESC, sort_order ASC, updated_at DESC
            "#,
        )
        .bind(scope)
        .bind(project_id)
        .fetch_all(pool)
        .await
        .map_err(to_db_error)?
    } else {
        sqlx::query(
            r#"
            SELECT id, scope, project_id, title, pinned, sort_order, created_at, updated_at
            FROM chat_conversations
            WHERE scope = ?1 AND project_id IS NULL
            ORDER BY pinned DESC, sort_order ASC, updated_at DESC
            "#,
        )
        .bind(scope)
        .fetch_all(pool)
        .await
        .map_err(to_db_error)?
    };

    let mut conversations = Vec::with_capacity(rows.len());
    for row in rows {
        let id: String = row.try_get("id").map_err(to_db_error)?;
        let messages = list_messages_for_conversation(pool, &id).await?;
        conversations.push(ChatConversationRow {
            id,
            scope: row.try_get("scope").map_err(to_db_error)?,
            project_id: row.try_get("project_id").map_err(to_db_error)?,
            title: row.try_get("title").map_err(to_db_error)?,
            pinned: row.try_get::<i64, _>("pinned").map_err(to_db_error)? != 0,
            sort_order: row.try_get("sort_order").map_err(to_db_error)?,
            created_at: row.try_get("created_at").map_err(to_db_error)?,
            updated_at: row.try_get("updated_at").map_err(to_db_error)?,
            messages,
        });
    }
    Ok(conversations)
}

async fn list_messages_for_conversation(
    pool: &SqlitePool,
    conversation_id: &str,
) -> Result<Vec<ChatMessageRow>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT id, role, content, reasoning_content, reasoning_duration_ms, mentions_json, created_at
        FROM chat_messages
        WHERE conversation_id = ?1
        ORDER BY sort_order ASC, created_at ASC
        "#,
    )
    .bind(conversation_id)
    .fetch_all(pool)
    .await
    .map_err(to_db_error)?;

    rows.into_iter()
        .map(|row| {
            Ok(ChatMessageRow {
                id: row.try_get("id").map_err(to_db_error)?,
                role: row.try_get("role").map_err(to_db_error)?,
                content: row.try_get("content").map_err(to_db_error)?,
                created_at: row.try_get("created_at").map_err(to_db_error)?,
                reasoning_content: row.try_get("reasoning_content").map_err(to_db_error)?,
                reasoning_duration_ms: row.try_get("reasoning_duration_ms").map_err(to_db_error)?,
                mentions_json: row.try_get("mentions_json").map_err(to_db_error)?,
            })
        })
        .collect()
}

pub async fn upsert_chat_conversation(
    pool: &SqlitePool,
    input: UpsertChatConversationInput,
) -> Result<ChatConversationRow, AppError> {
    let scope = input.scope.trim();
    let project_id = input
        .project_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string);
    validate_scope_project(scope, project_id.as_deref())?;

    let conversation = &input.conversation;
    if conversation.id.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "会话 ID 不能为空"));
    }
    for message in &conversation.messages {
        if message.id.trim().is_empty() {
            return Err(AppError::new("VALIDATION", "消息 ID 不能为空"));
        }
        if message.role != "user" && message.role != "assistant" {
            return Err(AppError::new("VALIDATION", "消息角色无效"));
        }
    }

    let mut tx = pool.begin().await.map_err(to_db_error)?;
    let timestamp = now();

    let existing = sqlx::query(
        r#"
        SELECT sort_order FROM chat_conversations WHERE id = ?1
        "#,
    )
    .bind(&conversation.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(to_db_error)?;

    let sort_order = if let Some(row) = existing {
        row.try_get::<i64, _>("sort_order").map_err(to_db_error)?
    } else {
        let max_row = if scope == CHAT_SCOPE_AGENT {
            sqlx::query(
                r#"
                SELECT COALESCE(MAX(sort_order), -1) AS max_order
                FROM chat_conversations
                WHERE scope = ?1 AND project_id = ?2
                "#,
            )
            .bind(scope)
            .bind(&project_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(to_db_error)?
        } else {
            sqlx::query(
                r#"
                SELECT COALESCE(MAX(sort_order), -1) AS max_order
                FROM chat_conversations
                WHERE scope = ?1 AND project_id IS NULL
                "#,
            )
            .bind(scope)
            .fetch_one(&mut *tx)
            .await
            .map_err(to_db_error)?
        };
        max_row.try_get::<i64, _>("max_order").map_err(to_db_error)? + 1
    };

    sqlx::query(
        r#"
        INSERT INTO chat_conversations (
          id, scope, project_id, title, pinned, sort_order, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(id) DO UPDATE SET
          scope = excluded.scope,
          project_id = excluded.project_id,
          title = excluded.title,
          pinned = excluded.pinned,
          updated_at = excluded.updated_at
        "#,
    )
    .bind(&conversation.id)
    .bind(scope)
    .bind(&project_id)
    .bind(conversation.title.trim())
    .bind(if conversation.pinned { 1 } else { 0 })
    .bind(sort_order)
    .bind(if conversation.created_at.trim().is_empty() {
        timestamp.as_str()
    } else {
        conversation.created_at.as_str()
    })
    .bind(if conversation.updated_at.trim().is_empty() {
        timestamp.as_str()
    } else {
        conversation.updated_at.as_str()
    })
    .execute(&mut *tx)
    .await
    .map_err(to_db_error)?;

    sqlx::query("DELETE FROM chat_messages WHERE conversation_id = ?1")
        .bind(&conversation.id)
        .execute(&mut *tx)
        .await
        .map_err(to_db_error)?;

    for (index, message) in conversation.messages.iter().enumerate() {
        sqlx::query(
            r#"
            INSERT INTO chat_messages (
              id, conversation_id, role, content, reasoning_content,
              reasoning_duration_ms, mentions_json, created_at, sort_order
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
        )
        .bind(&message.id)
        .bind(&conversation.id)
        .bind(&message.role)
        .bind(&message.content)
        .bind(&message.reasoning_content)
        .bind(message.reasoning_duration_ms)
        .bind(&message.mentions_json)
        .bind(&message.created_at)
        .bind(index as i64)
        .execute(&mut *tx)
        .await
        .map_err(to_db_error)?;
    }

    tx.commit().await.map_err(to_db_error)?;

    let list = list_chat_conversations(pool, scope, project_id.as_deref()).await?;
    list.into_iter()
        .find(|item| item.id == conversation.id)
        .ok_or_else(|| AppError::new("INTERNAL", "会话写入后未能读回"))
}

pub async fn delete_chat_conversation(pool: &SqlitePool, id: &str) -> Result<(), AppError> {
    if id.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "会话 ID 不能为空"));
    }
    let result = sqlx::query("DELETE FROM chat_conversations WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(to_db_error)?;
    if result.rows_affected() == 0 {
        return Err(AppError::new("NOT_FOUND", "会话不存在"));
    }
    Ok(())
}

pub async fn reorder_chat_conversations(
    pool: &SqlitePool,
    scope: &str,
    project_id: Option<&str>,
    ordered_ids: &[String],
) -> Result<(), AppError> {
    validate_scope_project(scope, project_id)?;
    if ordered_ids.is_empty() {
        return Ok(());
    }

    let mut tx = pool.begin().await.map_err(to_db_error)?;
    for (index, id) in ordered_ids.iter().enumerate() {
        let result = if scope == CHAT_SCOPE_AGENT {
            sqlx::query(
                r#"
                UPDATE chat_conversations
                SET sort_order = ?1, updated_at = ?2
                WHERE id = ?3 AND scope = ?4 AND project_id = ?5
                "#,
            )
            .bind(index as i64)
            .bind(now())
            .bind(id)
            .bind(scope)
            .bind(project_id)
            .execute(&mut *tx)
            .await
            .map_err(to_db_error)?
        } else {
            sqlx::query(
                r#"
                UPDATE chat_conversations
                SET sort_order = ?1, updated_at = ?2
                WHERE id = ?3 AND scope = ?4 AND project_id IS NULL
                "#,
            )
            .bind(index as i64)
            .bind(now())
            .bind(id)
            .bind(scope)
            .execute(&mut *tx)
            .await
            .map_err(to_db_error)?
        };
        if result.rows_affected() == 0 {
            return Err(AppError::new("NOT_FOUND", "会话不存在或不属于当前范围"));
        }
    }
    tx.commit().await.map_err(to_db_error)?;
    Ok(())
}
