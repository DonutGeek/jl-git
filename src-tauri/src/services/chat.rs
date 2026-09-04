//! 鲸灵会话业务规则：scope 与项目绑定校验、消息整体覆盖写、排序维护。

use sqlx::PgPool;

use crate::error::AppError;
use crate::models::chat::{
    ChatConversationRow, UpsertChatConversationInput, CHAT_SCOPE_AGENT, CHAT_SCOPE_AGENT_GLOBAL,
};
use crate::repositories::{self, now};

/// 单仓鲸灵必须绑项目，多仓鲸灵必须不绑项目。
fn validate_scope_project(scope: &str, project_id: Option<&str>) -> Result<(), AppError> {
    match scope {
        CHAT_SCOPE_AGENT => {
            if project_id
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .is_none()
            {
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

pub async fn list(
    pool: &PgPool,
    scope: &str,
    project_id: Option<&str>,
) -> Result<Vec<ChatConversationRow>, AppError> {
    validate_scope_project(scope, project_id)?;

    let heads = repositories::chat::list_heads(pool, scope, project_id).await?;
    let mut conversations = Vec::with_capacity(heads.len());
    for head in heads {
        let messages = repositories::chat::list_messages(pool, &head.id).await?;
        conversations.push(ChatConversationRow {
            id: head.id,
            scope: head.scope,
            project_id: head.project_id,
            title: head.title,
            pinned: head.pinned,
            sort_order: head.sort_order,
            created_at: head.created_at,
            updated_at: head.updated_at,
            messages,
        });
    }
    Ok(conversations)
}

/// 整会话覆盖写：消息先删后插，前端始终提交完整消息列表。
pub async fn upsert(
    pool: &PgPool,
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

    let mut tx = pool.begin().await?;
    let timestamp = now();

    // 已存在的会话保留原排序，新会话追加到末尾
    let sort_order = match repositories::chat::find_sort_order(&mut *tx, &conversation.id).await? {
        Some(existing) => existing,
        None => {
            repositories::chat::next_sort_order(&mut *tx, scope, project_id.as_deref()).await?
        }
    };

    let created_at = if conversation.created_at.trim().is_empty() {
        timestamp.as_str()
    } else {
        conversation.created_at.as_str()
    };
    let updated_at = if conversation.updated_at.trim().is_empty() {
        timestamp.as_str()
    } else {
        conversation.updated_at.as_str()
    };

    repositories::chat::upsert_head(
        &mut *tx,
        &conversation.id,
        scope,
        project_id.as_deref(),
        conversation.title.trim(),
        conversation.pinned,
        sort_order,
        created_at,
        updated_at,
    )
    .await?;

    repositories::chat::delete_messages(&mut *tx, &conversation.id).await?;
    for (index, message) in conversation.messages.iter().enumerate() {
        repositories::chat::insert_message(&mut *tx, &conversation.id, message, index as i64)
            .await?;
    }

    tx.commit().await?;

    list(pool, scope, project_id.as_deref())
        .await?
        .into_iter()
        .find(|item| item.id == conversation.id)
        .ok_or_else(|| AppError::new("INTERNAL", "会话写入后未能读回"))
}

pub async fn delete(pool: &PgPool, id: &str) -> Result<(), AppError> {
    if id.trim().is_empty() {
        return Err(AppError::new("VALIDATION", "会话 ID 不能为空"));
    }
    if repositories::chat::delete_conversation(pool, id).await? == 0 {
        return Err(AppError::new("NOT_FOUND", "会话不存在"));
    }
    Ok(())
}

pub async fn reorder(
    pool: &PgPool,
    scope: &str,
    project_id: Option<&str>,
    ordered_ids: &[String],
) -> Result<(), AppError> {
    validate_scope_project(scope, project_id)?;
    if ordered_ids.is_empty() {
        return Ok(());
    }

    let mut tx = pool.begin().await?;
    for (index, id) in ordered_ids.iter().enumerate() {
        let affected = repositories::chat::set_sort_order(
            &mut *tx,
            id,
            scope,
            project_id,
            index as i64,
            &now(),
        )
        .await?;
        if affected == 0 {
            return Err(AppError::new("NOT_FOUND", "会话不存在或不属于当前范围"));
        }
    }
    tx.commit().await?;
    Ok(())
}
