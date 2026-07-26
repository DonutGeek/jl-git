import type { Workspace } from "@/types/project";

export interface WorkspaceTreeNode {
  value: string;
  label: string;
  children: WorkspaceTreeNode[];
}

/** 将分组树展平为「上级 / 子级」标签选项；可排除指定节点（如编辑时防成环） */
export function buildWorkspaceOptions(
  workspaces: readonly Workspace[],
  excludeIds: ReadonlySet<string> = new Set(),
): Array<{ value: string; label: string }> {
  function flatten(
    nodes: readonly WorkspaceTreeNode[],
    prefix: string,
  ): Array<{ value: string; label: string }> {
    return nodes.flatMap((node) => [
      {
        value: node.value,
        label: prefix ? `${prefix} / ${node.label}` : node.label,
      },
      ...flatten(node.children, prefix ? `${prefix} / ${node.label}` : node.label),
    ]);
  }

  return flatten(buildWorkspaceTree(workspaces, excludeIds), "");
}

/** 构建可折叠的分组树（排除指定节点及其展示） */
export function buildWorkspaceTree(
  workspaces: readonly Workspace[],
  excludeIds: ReadonlySet<string> = new Set(),
): WorkspaceTreeNode[] {
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));

  function childrenOf(parentId: string | null): WorkspaceTreeNode[] {
    return workspaces
      .filter(
        (workspace) =>
          workspace.parentId === parentId && !excludeIds.has(workspace.id),
      )
      .map((workspace) => ({
        value: workspace.id,
        label: workspace.name,
        children: childrenOf(workspace.id),
      }));
  }

  const roots = workspaces.filter(
    (workspace) =>
      !excludeIds.has(workspace.id) &&
      (workspace.parentId === null || !workspaceIds.has(workspace.parentId)),
  );

  return roots.map((workspace) => ({
    value: workspace.id,
    label: workspace.name,
    children: childrenOf(workspace.id),
  }));
}

/** 编辑时排除自身及子孙，避免成环 */
export function collectWorkspaceSubtreeIds(
  workspaces: readonly Workspace[],
  rootId: string,
): Set<string> {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const workspace of workspaces) {
      if (
        workspace.parentId &&
        ids.has(workspace.parentId) &&
        !ids.has(workspace.id)
      ) {
        ids.add(workspace.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** 在树中查找节点标签（含路径时用叶子名即可） */
export function findWorkspaceTreeLabel(
  nodes: readonly WorkspaceTreeNode[],
  value: string,
): string | null {
  for (const node of nodes) {
    if (node.value === value) {
      return node.label;
    }
    const nested = findWorkspaceTreeLabel(node.children, value);
    if (nested) {
      return nested;
    }
  }
  return null;
}

/** 选中节点的全部祖先 id（用于默认展开） */
export function collectWorkspaceAncestorIds(
  nodes: readonly WorkspaceTreeNode[],
  value: string,
  trail: string[] = [],
): string[] | null {
  for (const node of nodes) {
    if (node.value === value) {
      return trail;
    }
    const found = collectWorkspaceAncestorIds(node.children, value, [
      ...trail,
      node.value,
    ]);
    if (found) {
      return found;
    }
  }
  return null;
}
