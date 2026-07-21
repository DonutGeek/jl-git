import dayjs from "dayjs";

import type { GitTag } from "@/types/git";

export type TagListSort = "nameAsc" | "nameDesc" | "timeDesc" | "timeAsc";

export interface TagListPrefs {
  sort: TagListSort;
}

export const DEFAULT_TAG_LIST_PREFS: TagListPrefs = {
  sort: "nameDesc",
};

const STORAGE_KEY = "jlgit:tag-list-prefs";

function isSort(value: unknown): value is TagListSort {
  return (
    value === "nameAsc" ||
    value === "nameDesc" ||
    value === "timeDesc" ||
    value === "timeAsc"
  );
}

export function readTagListPrefs(): TagListPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TAG_LIST_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_TAG_LIST_PREFS;
    const record = parsed as Record<string, unknown>;
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

function parseAuthoredMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = dayjs(trimmed);
  return parsed.isValid() ? parsed.valueOf() : null;
}

function compareTags(left: GitTag, right: GitTag, sort: TagListSort): number {
  if (sort === "nameAsc" || sort === "nameDesc") {
    const byName = left.name.localeCompare(right.name);
    return sort === "nameAsc" ? byName : -byName;
  }
  const leftMs = parseAuthoredMs(left.authoredAt);
  const rightMs = parseAuthoredMs(right.authoredAt);
  if (leftMs === rightMs) {
    return left.name.localeCompare(right.name);
  }
  if (leftMs === null) return 1;
  if (rightMs === null) return -1;
  return sort === "timeDesc" ? rightMs - leftMs : leftMs - rightMs;
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
