use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRow {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub locked: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// 分组树节点（上级选择 / TreeSelect）
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeNode {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub locked: bool,
    pub children: Vec<WorkspaceTreeNode>,
}

/// 仪表盘目录树：分组与仓库混排
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogTreeNode {
    pub key: String,
    pub kind: String,
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub locked: bool,
    pub path: Option<String>,
    pub selectable: bool,
    pub is_leaf: bool,
    pub children: Vec<CatalogTreeNode>,
}

/// 更新分组时的字段补丁
#[derive(Debug, Clone, Default)]
pub struct WorkspacePatch {
    pub name: Option<String>,
    pub parent_id: Option<Option<String>>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub locked: Option<bool>,
}
