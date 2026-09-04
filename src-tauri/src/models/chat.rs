use serde::{Deserialize, Serialize};

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
