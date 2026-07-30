export type RepoTabWorkspaceId = string | null | undefined;

export interface RepoTabGroupItem<T> {
  workspaceId: RepoTabWorkspaceId;
  value: T;
}

export interface RepoTabGroup<T> {
  key: string;
  workspaceId: RepoTabWorkspaceId;
  values: T[];
}

export type RepoTabDropAction = "none" | "reorder" | "ungroup" | "join-group";

export function repoTabGroupKey(workspaceId: RepoTabWorkspaceId): string {
  if (workspaceId === undefined) {
    return "new-tab";
  }
  if (workspaceId === null) {
    return "ungrouped";
  }
  return `workspace:${workspaceId}`;
}

/** 将标签合并为分组，同时保留各组首次出现及组内标签的相对顺序。 */
export function groupRepoTabs<T>(items: readonly RepoTabGroupItem<T>[]): RepoTabGroup<T>[] {
  const groups = new Map<string, RepoTabGroup<T>>();

  for (const item of items) {
    const key = repoTabGroupKey(item.workspaceId);
    const existing = groups.get(key);
    if (existing) {
      existing.values.push(item.value);
      continue;
    }
    groups.set(key, {
      key,
      workspaceId: item.workspaceId,
      values: [item.value],
    });
  }

  return [...groups.values()];
}

/**
 * 标签拖放：
 * - 命名组内：仅组内排序；离开原组 → 取消分组
 * - 未分组：可组内排序，或拖入命名组
 * - 新标签页：只在自身区域内排序
 */
export function resolveRepoTabDropAction(options: {
  activeWorkspaceId: RepoTabWorkspaceId;
  overWorkspaceId: RepoTabWorkspaceId;
  hasOverTarget: boolean;
  overIsTab: boolean;
}): RepoTabDropAction {
  const { activeWorkspaceId, overWorkspaceId, hasOverTarget, overIsTab } = options;

  if (typeof activeWorkspaceId === "string") {
    if (!hasOverTarget || activeWorkspaceId !== overWorkspaceId) {
      return "ungroup";
    }
    return overIsTab ? "reorder" : "none";
  }

  if (activeWorkspaceId === undefined) {
    if (!hasOverTarget || overWorkspaceId !== undefined) {
      return "none";
    }
    return overIsTab ? "reorder" : "none";
  }

  // 未分组
  if (!hasOverTarget) {
    return "none";
  }
  if (typeof overWorkspaceId === "string") {
    return "join-group";
  }
  if (overWorkspaceId === null) {
    return overIsTab ? "reorder" : "none";
  }
  return "none";
}

/** 在命名组 id 列表中移动一项；无效时返回 null。 */
export function reorderNamedGroupIds(
  orderedIds: readonly string[],
  activeId: string,
  overId: string,
): string[] | null {
  const oldIndex = orderedIds.indexOf(activeId);
  const newIndex = orderedIds.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return null;
  }
  const next = [...orderedIds];
  const [removed] = next.splice(oldIndex, 1);
  if (!removed) {
    return null;
  }
  next.splice(newIndex, 0, removed);
  return next;
}

/**
 * 按新的命名组顺序回写 sortOrder：复用这些组原有的 sortOrder 值池，
 * 避免扰动未出现在标签栏的其它 workspace。
 */
export function resolveWorkspaceGroupSortOrders(options: {
  orderedWorkspaceIds: readonly string[];
  workspaces: ReadonlyArray<{ id: string; sortOrder: number }>;
}): Array<{ id: string; sortOrder: number }> {
  const { orderedWorkspaceIds, workspaces } = options;
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace.sortOrder]));
  const pool = orderedWorkspaceIds
    .map((id) => byId.get(id))
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => left - right);

  return orderedWorkspaceIds.map((id, index) => ({
    id,
    sortOrder: pool[index] ?? index,
  }));
}
