import type { GitTag } from "@/types/git";

export type TagListSort = "nameAsc" | "nameDesc";

export interface TagListPrefs {
  sort: TagListSort;
}

export const DEFAULT_TAG_LIST_PREFS: TagListPrefs = {
  sort: "nameDesc",
};

const STORAGE_KEY = "jlgit:tag-list-prefs";

function isSort(value: unknown): value is TagListSort {
  return value === "nameAsc" || value === "nameDesc";
}

export function readTagListPrefs(): TagListPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TAG_LIST_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_TAG_LIST_PREFS;
    const record = parsed as Record<string, unknown>;
    // 旧版 timeAsc / timeDesc 等回退默认
    return {
      sort: isSort(record.sort) ? record.sort : DEFAULT_TAG_LIST_PREFS.sort,
    };
  } catch {
    return DEFAULT_TAG_LIST_PREFS;
  }
}

export function writeTagListPrefs(prefs: TagListPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

export function patchTagListPrefs(
  current: TagListPrefs,
  patch: Partial<TagListPrefs>,
): TagListPrefs {
  const next = { ...current, ...patch };
  writeTagListPrefs(next);
  return next;
}

export function isTagListPrefsDefault(prefs: TagListPrefs): boolean {
  return prefs.sort === DEFAULT_TAG_LIST_PREFS.sort;
}

function compareTags(left: GitTag, right: GitTag, sort: TagListSort): number {
  const byName = left.name.localeCompare(right.name);
  return sort === "nameAsc" ? byName : -byName;
}

/** 关键字过滤 + 排序（侧栏标签列表） */
export function filterAndSortTags(
  tags: readonly GitTag[],
  prefs: TagListPrefs,
  nameFilter: string,
): GitTag[] {
  const query = nameFilter.trim().toLowerCase();
  let next = query
    ? tags.filter((tag) => {
        const haystack = `${tag.name} ${tag.message ?? ""}`.toLowerCase();
        return haystack.includes(query);
      })
    : [...tags];
  next.sort((left, right) => compareTags(left, right, prefs.sort));
  return next;
}
