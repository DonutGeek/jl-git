use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub workspace_id: Option<String>,
    pub name: String,
    /// 项目简介（可空）
    pub description: Option<String>,
    pub icon: String,
    pub path: String,
    /// 主远端 URL；空串表示已探测但仓库没有远端；NULL 表示尚未写入
    pub remote_url: Option<String>,
    pub last_opened_at: Option<String>,
    pub pinned: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct WorkspaceOrderItem {
    pub id: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone)]
pub struct ProjectOrderItem {
    pub id: String,
    pub workspace_id: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentProjectItem {
    pub project_id: String,
    pub opened_at: String,
}

/// 更新项目时的字段补丁；外层 `Option` 表示「是否改这个字段」。
#[derive(Debug, Clone, Default)]
pub struct ProjectPatch {
    pub name: Option<String>,
    pub workspace_id: Option<Option<String>>,
    pub description: Option<Option<String>>,
    pub icon: Option<String>,
    pub path: Option<String>,
    pub allow_remote_mismatch: bool,
}
