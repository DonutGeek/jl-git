import type { GitLogOptions } from "@/types/git";

/** 历史高级筛选（Git 级条件） */
export interface HistoryAdvancedFilters {
  grep: string;
  path: string;
  /** YYYY-MM-DD 或空 */
  since: string | null;
  until: string | null;
  author: string;
  showMergeCommits: boolean;
}

export const EMPTY_HISTORY_ADVANCED_FILTERS: HistoryAdvancedFilters = {
  grep: "",
  path: "",
  since: null,
  until: null,
  author: "",
  showMergeCommits: true,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 是否存在会传给 git_log 的高级条件（不含合并开关本身） */
export function hasActiveAdvancedGitFilters(
  filters: HistoryAdvancedFilters | null | undefined,
): boolean {
  if (!filters) {
    return false;
  }
  return Boolean(
    filters.grep.trim() ||
      filters.path.trim() ||
      filters.since ||
      filters.until ||
      filters.author.trim() ||
      !filters.showMergeCommits,
  );
}

/** 起止日期非法：两者皆有且 until < since */
export function isAdvancedDateRangeInvalid(
  filters: Pick<HistoryAdvancedFilters, "since" | "until">,
): boolean {
  if (!filters.since || !filters.until) {
    return false;
  }
  return filters.until < filters.since;
}

/** 粗检仓库相对路径（最终以后端校验为准） */
export function isAdvancedPathSuspicious(path: string): boolean {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/") || /^[a-zA-Z]:/.test(trimmed)) {
    return true;
  }
  return trimmed.split("/").some((part) => part === "..");
}

/** 转为 git_log 可选字段（空项省略） */
export function historyAdvancedToLogOptions(
  filters: HistoryAdvancedFilters | null | undefined,
): Pick<
  GitLogOptions,
  "grep" | "path" | "since" | "until" | "authors" | "noMerges"
> {
  if (!filters) {
    return {};
  }

  const grep = filters.grep.trim();
  const path = filters.path.trim().replace(/\\/g, "/");
  const author = filters.author.trim();
  const since = filters.since?.trim() || undefined;
  const until = filters.until?.trim() || undefined;

  return {
    ...(grep ? { grep } : {}),
    ...(path ? { path } : {}),
    ...(since ? { since } : {}),
    ...(until ? { until } : {}),
    ...(author ? { authors: [escapeRegExp(author)] } : {}),
    ...(!filters.showMergeCommits ? { noMerges: true } : {}),
  };
}
