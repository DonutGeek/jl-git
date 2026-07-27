import dayjs from "dayjs";

import type { Project } from "@/types/project";

export const MANAGE_ALL_GROUPS = "__all__";
export const MANAGE_UNGROUPED = "__ungrouped__";
export const MANAGE_DIRTY_ALL = "all";
export const MANAGE_DIRTY_DIRTY = "dirty";
export const MANAGE_DIRTY_CLEAN = "clean";
export const MANAGE_SYNC_ALL = "all";
export const MANAGE_SYNC_AHEAD = "ahead";
export const MANAGE_SYNC_BEHIND = "behind";
export const MANAGE_SYNC_DIVERGED = "diverged";

export type ManageSortBy = "lastOpened" | "name" | "path" | "createdAt";
export type ManageDirtyFilter =
  typeof MANAGE_DIRTY_ALL | typeof MANAGE_DIRTY_DIRTY | typeof MANAGE_DIRTY_CLEAN;
export type ManageSyncFilter =
  | typeof MANAGE_SYNC_ALL
  | typeof MANAGE_SYNC_AHEAD
  | typeof MANAGE_SYNC_BEHIND
  | typeof MANAGE_SYNC_DIVERGED;

export interface ManageFilters {
  /** 同时匹配名称 / 路径 / 简介 */
  keyword: string;
  group: string;
  sortBy: ManageSortBy;
  dirty: ManageDirtyFilter;
  sync: ManageSyncFilter;
}

export const EMPTY_MANAGE_FILTERS: ManageFilters = {
  keyword: "",
  group: MANAGE_ALL_GROUPS,
  sortBy: "lastOpened",
  dirty: MANAGE_DIRTY_ALL,
  sync: MANAGE_SYNC_ALL,
};

/** 筛选所需的轻量 Git 探针字段（仅已探测行参与 dirty/sync 条件） */
export interface ManageGitProbeLite {
  dirtyCount: number;
  ahead: number;
  behind: number;
  ready: boolean;
}

function includesIgnoreCase(haystack: string, needle: string): boolean {
  if (!needle) {
    return true;
  }
  return haystack.toLowerCase().includes(needle);
}

function matchesDirty(probe: ManageGitProbeLite | undefined, dirty: ManageDirtyFilter): boolean {
  if (dirty === MANAGE_DIRTY_ALL) {
    return true;
  }
  if (!probe?.ready) {
    return false;
  }
  if (dirty === MANAGE_DIRTY_DIRTY) {
    return probe.dirtyCount > 0;
  }
  return probe.dirtyCount === 0;
}

function matchesSync(probe: ManageGitProbeLite | undefined, sync: ManageSyncFilter): boolean {
  if (sync === MANAGE_SYNC_ALL) {
    return true;
  }
  if (!probe?.ready) {
    return false;
  }
  if (sync === MANAGE_SYNC_AHEAD) {
    return probe.ahead > 0 && probe.behind === 0;
  }
  if (sync === MANAGE_SYNC_BEHIND) {
    return probe.behind > 0 && probe.ahead === 0;
  }
  return probe.ahead > 0 && probe.behind > 0;
}

function sortProjects(rows: Project[], sortBy: ManageSortBy): Project[] {
  return rows.slice().sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "path") {
      return a.path.localeCompare(b.path);
    }
    if (sortBy === "createdAt") {
      const aTime = dayjs(a.createdAt).valueOf();
      const bTime = dayjs(b.createdAt).valueOf();
      if (aTime !== bTime) {
        return bTime - aTime;
      }
      return a.name.localeCompare(b.name);
    }
    const aTime = a.lastOpenedAt ? dayjs(a.lastOpenedAt).valueOf() : 0;
    const bTime = b.lastOpenedAt ? dayjs(b.lastOpenedAt).valueOf() : 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }
    return a.name.localeCompare(b.name);
  });
}

function matchesGroup(project: Project, group: string): boolean {
  if (group === MANAGE_UNGROUPED && project.workspaceId != null) {
    return false;
  }
  if (group !== MANAGE_ALL_GROUPS && group !== MANAGE_UNGROUPED && project.workspaceId !== group) {
    return false;
  }
  return true;
}

function matchesKeyword(project: Project, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return (
    includesIgnoreCase(project.name, needle) ||
    includesIgnoreCase(project.path, needle) ||
    includesIgnoreCase(project.description ?? "", needle)
  );
}

/** 按管理台筛选条件过滤并排序仓库列表 */
export function filterAndSortProjects(
  projects: readonly Project[],
  filters: ManageFilters,
  probes: ReadonlyMap<string, ManageGitProbeLite>,
): Project[] {
  const rows = projects.filter((project) => {
    if (!matchesGroup(project, filters.group)) {
      return false;
    }
    if (!matchesKeyword(project, filters.keyword)) {
      return false;
    }
    const probe = probes.get(project.id);
    if (!matchesDirty(probe, filters.dirty)) {
      return false;
    }
    if (!matchesSync(probe, filters.sync)) {
      return false;
    }
    return true;
  });

  return sortProjects(rows, filters.sortBy);
}

/** 生成分页页码序列（含省略号占位） */
export function buildManagePageItems(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const items: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) {
    items.push("ellipsis");
  }
  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }
  if (end < total - 1) {
    items.push("ellipsis");
  }
  items.push(total);
  return items;
}
