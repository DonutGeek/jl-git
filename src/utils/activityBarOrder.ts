const SIDEBAR_VIEWS = [
  "files",
  "branches",
  "tags",
  "agent",
] as const;

export type SidebarView = (typeof SIDEBAR_VIEWS)[number];

export const DEFAULT_ACTIVITY_BAR_ORDER = [
  "files",
  "branches",
  "tags",
  "search",
  "agent",
] as const;

export type ActivityBarItemId = (typeof DEFAULT_ACTIVITY_BAR_ORDER)[number];

const ACTIVITY_BAR_ITEM_IDS = new Set<string>(DEFAULT_ACTIVITY_BAR_ORDER);

function isActivityBarItemId(value: unknown): value is ActivityBarItemId {
  return typeof value === "string" && ACTIVITY_BAR_ITEM_IDS.has(value);
}

/** 清理持久化顺序：移除未知项与重复项，并把新增入口补到末尾。 */
export function normalizeActivityBarOrder(value: unknown): ActivityBarItemId[] {
  const seen = new Set<ActivityBarItemId>();
  const normalized: ActivityBarItemId[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (isActivityBarItemId(item) && !seen.has(item)) {
        seen.add(item);
        normalized.push(item);
      }
    }
  }

  // 旧版本中搜索固定显示在鲸灵前；首次迁移到可排序入口时保持原位置。
  if (!seen.has("search") && seen.has("agent")) {
    const agentIndex = normalized.indexOf("agent");
    normalized.splice(agentIndex, 0, "search");
    seen.add("search");
  }

  for (const item of DEFAULT_ACTIVITY_BAR_ORDER) {
    if (!seen.has(item)) {
      normalized.push(item);
    }
  }

  return normalized;
}

/** 将活动栏入口移动到目标入口所在位置。 */
export function moveActivityBarItem(
  order: unknown,
  activeId: string,
  overId: string,
): ActivityBarItemId[] {
  const normalized = normalizeActivityBarOrder(order);
  const fromIndex = normalized.findIndex((item) => item === activeId);
  const toIndex = normalized.findIndex((item) => item === overId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return normalized;
  }

  const next = [...normalized];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
