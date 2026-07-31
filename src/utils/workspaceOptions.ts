import type { Workspace, WorkspaceColor, WorkspaceIcon } from "@/types/project";
import { normalizeWorkspaceColor } from "@/utils/workspaceColor";

export interface WorkspaceTreeNode {
  value: string;
  label: string;
  icon: WorkspaceIcon;
  color: WorkspaceColor;
  children: WorkspaceTreeNode[];
  disabled?: boolean;
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

export interface BuildWorkspaceTreeOptions {
  /** 锁定分组不可选（仍可展示当前值） */
  disableLocked?: boolean;
  /** 当前已选值：即使锁定也保持可选，避免触发器空白 */
  allowLockedValue?: string;
}

/** 构建可折叠的分组树（排除指定节点及其展示） */
export function buildWorkspaceTree(
  workspaces: readonly Workspace[],
  excludeIds: ReadonlySet<string> = new Set(),
  options: BuildWorkspaceTreeOptions = {},
): WorkspaceTreeNode[] {
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const { disableLocked = false, allowLockedValue } = options;

  function toNode(workspace: Workspace): WorkspaceTreeNode {
    const lockedDisabled = disableLocked && workspace.locked && workspace.id !== allowLockedValue;
    return {
      value: workspace.id,
      label: workspace.name,
      icon: workspace.icon,
      color: normalizeWorkspaceColor(workspace.color),
      children: childrenOf(workspace.id),
      ...(lockedDisabled ? { disabled: true } : {}),
    };
  }

  function childrenOf(parentId: string | null): WorkspaceTreeNode[] {
    return workspaces
      .filter((workspace) => workspace.parentId === parentId && !excludeIds.has(workspace.id))
      .map(toNode);
  }

  const roots = workspaces.filter(
    (workspace) =>
      !excludeIds.has(workspace.id) &&
      (workspace.parentId === null || !workspaceIds.has(workspace.parentId)),
  );

  return roots.map(toNode);
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
      if (workspace.parentId && ids.has(workspace.parentId) && !ids.has(workspace.id)) {
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
  return findWorkspaceTreeNode(nodes, value)?.label ?? null;
}

/** 在树中查找节点（含图标 / 颜色） */
export function findWorkspaceTreeNode(
  nodes: readonly WorkspaceTreeNode[],
  value: string,
): WorkspaceTreeNode | null {
  for (const node of nodes) {
    if (node.value === value) {
      return node;
    }
    const nested = findWorkspaceTreeNode(node.children, value);
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
    const found = collectWorkspaceAncestorIds(node.children, value, [...trail, node.value]);
    if (found) {
      return found;
    }
  }
  return null;
}
