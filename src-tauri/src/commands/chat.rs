use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::db::{
    self, ChatConversationRow, UpsertChatConversationInput,
};
use crate::error::AppError;

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
    pool: State<'_, SqlitePool>,
    scope: String,
    project_id: Option<String>,
) -> Result<ChatConversationListResult, AppError> {
    let conversations =
        db::list_chat_conversations(&pool, &scope, project_id.as_deref()).await?;
    Ok(ChatConversationListResult { conversations })
}

#[tauri::command]
pub async fn chat_upsert_conversation(
    pool: State<'_, SqlitePool>,
    input: UpsertChatConversationInput,
) -> Result<ChatConversationResult, AppError> {
    let conversation = db::upsert_chat_conversation(&pool, input).await?;
    Ok(ChatConversationResult { conversation })
}

#[tauri::command]
pub async fn chat_delete_conversation(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<OkResult, AppError> {
    db::delete_chat_conversation(&pool, &id).await?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn chat_reorder_conversations(
    pool: State<'_, SqlitePool>,
    input: ChatReorderInput,
) -> Result<OkResult, AppError> {
    db::reorder_chat_conversations(
        &pool,
        &input.scope,
        input.project_id.as_deref(),
        &input.ordered_ids,
    )
    .await?;
    Ok(OkResult { ok: true })
}
