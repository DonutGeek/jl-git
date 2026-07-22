import type { GitBranch } from "@/types/git";

export type BranchListSort = "nameAsc" | "nameDesc";

export interface BranchListPrefs {
  sort: BranchListSort;
}

export const DEFAULT_BRANCH_LIST_PREFS: BranchListPrefs = {
  sort: "nameAsc",
};

const STORAGE_KEY = "jlgit:branch-list-prefs";

function isSort(value: unknown): value is BranchListSort {
  return value === "nameAsc" || value === "nameDesc";
}

export function readBranchListPrefs(): BranchListPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRANCH_LIST_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_BRANCH_LIST_PREFS;
    const record = parsed as Record<string, unknown>;
    // 旧版 timeAsc / timeDesc 等回退默认
    return {
      sort: isSort(record.sort) ? record.sort : DEFAULT_BRANCH_LIST_PREFS.sort,
    };
  } catch {
    return DEFAULT_BRANCH_LIST_PREFS;
  }
}

export function writeBranchListPrefs(prefs: BranchListPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

export function patchBranchListPrefs(
  current: BranchListPrefs,
  patch: Partial<BranchListPrefs>,
): BranchListPrefs {
  const next = { ...current, ...patch };
  writeBranchListPrefs(next);
  return next;
}

export function isBranchListPrefsDefault(prefs: BranchListPrefs): boolean {
  return prefs.sort === DEFAULT_BRANCH_LIST_PREFS.sort;
}

function compareBranches(
  left: GitBranch,
  right: GitBranch,
  sort: BranchListSort,
): number {
  const byName = left.name.localeCompare(right.name);
  return sort === "nameAsc" ? byName : -byName;
}

/** 关键字过滤 + 排序（供侧栏树复用） */
export function filterAndSortBranches(
  branches: readonly GitBranch[],
  prefs: BranchListPrefs,
  nameFilter: string,
): GitBranch[] {
  const query = nameFilter.trim().toLowerCase();
  let next = query
    ? branches.filter((branch) => {
        const haystack =
          `${branch.name} ${branch.upstream ?? ""} ${branch.tipAuthorName}`.toLowerCase();
        return haystack.includes(query);
      })
    : [...branches];

  next = [...next].sort((left, right) => compareBranches(left, right, prefs.sort));
  return next;
}
