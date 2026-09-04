//! 分组业务规则：命名/颜色/图标校验、父子环检测、锁定保护、树结构组装。

use std::collections::HashSet;

use sqlx::PgPool;

use crate::error::AppError;
use crate::models::project::ProjectRow;
use crate::models::workspace::{CatalogTreeNode, WorkspacePatch, WorkspaceRow, WorkspaceTreeNode};
use crate::repositories::{self, now};

pub async fn list(pool: &PgPool) -> Result<Vec<WorkspaceRow>, AppError> {
    repositories::workspace::list(pool).await
}

pub async fn create(
    pool: &PgPool,
    name: String,
    parent_id: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<WorkspaceRow, AppError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::new("VALIDATION", "分组名称不能为空"));
    }
    let parent_id = parent_id.filter(|value| !value.trim().is_empty());
    let icon = normalize_optional_icon(icon)?;
    let color = normalize_color(color.as_deref().unwrap_or(""))?;
    if let Some(parent_id) = parent_id.as_deref() {
        if !repositories::workspace::exists(pool, parent_id).await? {
            return Err(AppError::new("NOT_FOUND", "父分组不存在"));
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    repositories::workspace::insert(
        pool,
        &id,
        parent_id.as_deref(),
        &name,
        &icon,
        &color,
        &now(),
    )
    .await?;

    repositories::workspace::get(pool, &id).await
}

pub async fn update(
    pool: &PgPool,
    id: &str,
    patch: WorkspacePatch,
) -> Result<WorkspaceRow, AppError> {
    let name = patch
        .name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let icon = patch
        .icon
        .map(|value| normalize_optional_icon(Some(value)))
        .transpose()?;
    let color = patch.color.as_deref().map(normalize_color).transpose()?;
    if name.is_none()
        && patch.parent_id.is_none()
        && icon.is_none()
        && color.is_none()
        && patch.locked.is_none()
    {
        return Err(AppError::new("VALIDATION", "没有可更新的分组字段"));
    }

    let current = repositories::workspace::get(pool, id).await?;
    if current.locked && patch.parent_id.is_some() {
        return Err(AppError::new("VALIDATION", "锁定的分组不能调整父级"));
    }

    if let Some(Some(parent_id)) = patch.parent_id.as_ref() {
        ensure_parent_assignable(pool, id, parent_id).await?;
    }

    let parent_id = patch.parent_id.clone().flatten();
    let affected = repositories::workspace::update_fields(
        pool,
        id,
        name.as_deref(),
        patch.parent_id.is_some(),
        parent_id.as_deref(),
        icon.as_deref(),
        color.as_deref(),
        patch.locked,
        &now(),
    )
    .await?;
    if affected == 0 {
        return Err(AppError::new("NOT_FOUND", "分组不存在"));
    }

    repositories::workspace::get(pool, id).await
}

/// 删组不删仓库：子组升为根组，仓库移出到根层级。
pub async fn delete(pool: &PgPool, id: &str) -> Result<(), AppError> {
    let current = repositories::workspace::get(pool, id).await?;
    if current.locked {
        return Err(AppError::new("VALIDATION", "锁定的分组不能删除"));
    }

    let mut tx = pool.begin().await?;
    if repositories::workspace::delete(&mut *tx, id).await? == 0 {
        return Err(AppError::new("NOT_FOUND", "分组不存在"));
    }
    repositories::workspace::promote_children_to_root(&mut *tx, id).await?;
    repositories::project::detach_workspace(&mut *tx, id).await?;
    tx.commit().await?;

    Ok(())
}

/// 禁止把分组挂到自己或自己的子孙下，避免成环。
async fn ensure_parent_assignable(
    pool: &PgPool,
    id: &str,
    parent_id: &str,
) -> Result<(), AppError> {
    if parent_id == id {
        return Err(AppError::new("VALIDATION", "不能将分组设为自己的父级"));
    }
    if !repositories::workspace::exists(pool, parent_id).await? {
        return Err(AppError::new("NOT_FOUND", "父分组不存在"));
    }

    let mut cursor = Some(parent_id.to_string());
    while let Some(current) = cursor {
        if current == id {
            return Err(AppError::new("VALIDATION", "不能将分组移动到其子分组下"));
        }
        cursor = repositories::workspace::parent_of(pool, &current).await?;
    }
    Ok(())
}

/// 编辑上级时排除自身及子孙，避免成环
pub fn collect_subtree_ids(workspaces: &[WorkspaceRow], root_id: &str) -> HashSet<String> {
    let mut ids = HashSet::from([root_id.to_string()]);
    let mut grew = true;
    while grew {
        grew = false;
        for workspace in workspaces {
            if let Some(parent_id) = workspace.parent_id.as_deref() {
                if ids.contains(parent_id) && ids.insert(workspace.id.clone()) {
                    grew = true;
                }
            }
        }
    }
    ids
}

/// 把扁平分组收成树；`exclude_id` 会去掉该节点及其子孙
pub fn build_tree(
    workspaces: &[WorkspaceRow],
    exclude_id: Option<&str>,
) -> Vec<WorkspaceTreeNode> {
    let exclude = exclude_id
        .map(|id| collect_subtree_ids(workspaces, id))
        .unwrap_or_default();
    let id_set: HashSet<&str> = workspaces.iter().map(|item| item.id.as_str()).collect();
    workspaces
        .iter()
        .filter(|workspace| {
            !exclude.contains(&workspace.id)
                && match workspace.parent_id.as_deref() {
                    None => true,
                    Some(parent_id) => !id_set.contains(parent_id),
                }
        })
        .map(|workspace| to_tree_node(workspaces, workspace, &exclude))
        .collect()
}

fn to_tree_node(
    workspaces: &[WorkspaceRow],
    workspace: &WorkspaceRow,
    exclude: &HashSet<String>,
) -> WorkspaceTreeNode {
    WorkspaceTreeNode {
        id: workspace.id.clone(),
        name: workspace.name.clone(),
        icon: workspace.icon.clone(),
        color: workspace.color.clone(),
        locked: workspace.locked,
        children: workspaces
            .iter()
            .filter(|child| {
                child.parent_id.as_deref() == Some(workspace.id.as_str())
                    && !exclude.contains(&child.id)
            })
            .map(|child| to_tree_node(workspaces, child, exclude))
            .collect(),
    }
}

/// 分组 + 仓库混排目录树；`query` 只过滤仓库名称/路径
pub fn build_catalog_tree(
    workspaces: &[WorkspaceRow],
    projects: &[ProjectRow],
    query: Option<&str>,
) -> Vec<CatalogTreeNode> {
    let query = query.unwrap_or("").trim().to_lowercase();
    catalog_children(workspaces, projects, None, &query)
}

struct MixedCatalogItem<'a> {
    sort_order: i64,
    is_project: bool,
    name: &'a str,
    workspace: Option<&'a WorkspaceRow>,
    project: Option<&'a ProjectRow>,
}

fn catalog_children(
    workspaces: &[WorkspaceRow],
    projects: &[ProjectRow],
    parent_id: Option<&str>,
    query: &str,
) -> Vec<CatalogTreeNode> {
    let id_set: HashSet<&str> = workspaces.iter().map(|item| item.id.as_str()).collect();
    let mut items: Vec<MixedCatalogItem<'_>> = Vec::new();

    for workspace in workspaces {
        let in_parent = match parent_id {
            None => {
                workspace.parent_id.is_none()
                    || !id_set.contains(workspace.parent_id.as_deref().unwrap_or(""))
            }
            Some(id) => workspace.parent_id.as_deref() == Some(id),
        };
        if in_parent {
            items.push(MixedCatalogItem {
                sort_order: workspace.sort_order,
                is_project: false,
                name: workspace.name.as_str(),
                workspace: Some(workspace),
                project: None,
            });
        }
    }

    for project in projects {
        let in_parent = match parent_id {
            None => project.workspace_id.is_none(),
            Some(id) => project.workspace_id.as_deref() == Some(id),
        };
        if in_parent && project_matches_query(project, query) {
            items.push(MixedCatalogItem {
                sort_order: project.sort_order,
                is_project: true,
                name: project.name.as_str(),
                workspace: None,
                project: Some(project),
            });
        }
    }

    items.sort_by(|left, right| {
        left.sort_order
            .cmp(&right.sort_order)
            .then_with(|| right.is_project.cmp(&left.is_project))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    items
        .into_iter()
        .filter_map(|item| {
            if let Some(project) = item.project {
                return Some(catalog_project_node(project));
            }
            item.workspace
                .map(|workspace| catalog_workspace_node(workspaces, projects, workspace, query))
        })
        .collect()
}

fn project_matches_query(project: &ProjectRow, query: &str) -> bool {
    if query.is_empty() {
        return true;
    }
    project.name.to_lowercase().contains(query) || project.path.to_lowercase().contains(query)
}

fn catalog_project_node(project: &ProjectRow) -> CatalogTreeNode {
    CatalogTreeNode {
        key: format!("project:{}", project.id),
        kind: "project".into(),
        id: project.id.clone(),
        parent_id: project.workspace_id.clone(),
        name: project.name.clone(),
        icon: project.icon.clone(),
        color: String::new(),
        locked: false,
        path: Some(project.path.clone()),
        selectable: true,
        is_leaf: true,
        children: vec![],
    }
}

fn catalog_workspace_node(
    workspaces: &[WorkspaceRow],
    projects: &[ProjectRow],
    workspace: &WorkspaceRow,
    query: &str,
) -> CatalogTreeNode {
    CatalogTreeNode {
        key: format!("workspace:{}", workspace.id),
        kind: "workspace".into(),
        id: workspace.id.clone(),
        parent_id: workspace.parent_id.clone(),
        name: workspace.name.clone(),
        icon: workspace.icon.clone(),
        color: workspace.color.clone(),
        locked: workspace.locked,
        path: None,
        selectable: false,
        is_leaf: false,
        children: catalog_children(workspaces, projects, Some(workspace.id.as_str()), query),
    }
}

/// 空串表示不设色；早期库存的 blue/green 等名字在此转 HEX。
pub fn normalize_color(value: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    let legacy = match trimmed.to_ascii_lowercase().as_str() {
        "blue" => Some("#5F75C1"),
        "green" => Some("#4E925E"),
        "orange" => Some("#D27830"),
        "purple" => Some("#AA6BAE"),
        "red" => Some("#CD6055"),
        _ => None,
    };
    if let Some(color) = legacy {
        return Ok(color.to_string());
    }
    let Some(hex) = trimmed.strip_prefix('#') else {
        return Err(AppError::new("VALIDATION", "分组颜色必须是 #RRGGBB 格式"));
    };
    if hex.len() != 6 || !hex.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err(AppError::new("VALIDATION", "分组颜色必须是 #RRGGBB 格式"));
    }
    Ok(format!("#{}", hex.to_ascii_uppercase()))
}

fn normalize_optional_icon(value: Option<String>) -> Result<String, AppError> {
    match value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
    {
        None => Ok(String::new()),
        Some(icon) => normalize_icon_name(&icon),
    }
}

/// 图标名须为 kebab-case，与前端 `@/components/Icon` 的取名一致。
pub fn normalize_icon_name(icon: &str) -> Result<String, AppError> {
    if icon.len() > 64 {
        return Err(AppError::new("VALIDATION", "图标名称过长"));
    }
    if !icon.chars().all(|character| {
        character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
    }) || icon.starts_with('-')
        || icon.ends_with('-')
        || icon.contains("--")
        || !icon
            .chars()
            .any(|character| character.is_ascii_alphanumeric())
    {
        return Err(AppError::new("VALIDATION", "图标名称须为 kebab-case"));
    }
    Ok(icon.to_string())
}
