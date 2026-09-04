//! 鲸灵会话 Command：薄壳，业务规则在 `services::chat`。

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::models::chat::{ChatConversationRow, UpsertChatConversationInput};
use crate::services;
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatConversationListResult {
    conversations: Vec<ChatConversationRow>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatConversationResult {
    conversation: ChatConversationRow,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResult {
    ok: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatReorderInput {
    scope: String,
    project_id: Option<String>,
    ordered_ids: Vec<String>,
}

#[tauri::command]
pub async fn chat_list_conversations(
    state: State<'_, AppState>,
    scope: String,
    project_id: Option<String>,
) -> Result<ChatConversationListResult, AppError> {
    let pool = state.pool().await?;
    let conversations = services::chat::list(&pool, &scope, project_id.as_deref()).await?;
    Ok(ChatConversationListResult { conversations })
}

#[tauri::command]
pub async fn chat_upsert_conversation(
    state: State<'_, AppState>,
    input: UpsertChatConversationInput,
) -> Result<ChatConversationResult, AppError> {
    let pool = state.pool().await?;
    let conversation = services::chat::upsert(&pool, input).await?;
    Ok(ChatConversationResult { conversation })
}

#[tauri::command]
pub async fn chat_delete_conversation(
    state: State<'_, AppState>,
    id: String,
) -> Result<OkResult, AppError> {
    let pool = state.pool().await?;
    services::chat::delete(&pool, &id).await?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn chat_reorder_conversations(
    state: State<'_, AppState>,
    input: ChatReorderInput,
) -> Result<OkResult, AppError> {
    let pool = state.pool().await?;
    services::chat::reorder(
        &pool,
        &input.scope,
        input.project_id.as_deref(),
        &input.ordered_ids,
    )
    .await?;
    Ok(OkResult { ok: true })
}
