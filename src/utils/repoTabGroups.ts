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

export type RepoTabDropAction = "none" | "reorder" | "ungroup";

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
 * 分组标签只允许组内排序：
 * - 已分组标签离开原组即转为未分组
 * - 未分组标签不能直接拖入其它分组
 * - 新标签页只在自身区域内处理
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

  if (!hasOverTarget || activeWorkspaceId !== overWorkspaceId) {
    return "none";
  }
  return overIsTab ? "reorder" : "none";
}
