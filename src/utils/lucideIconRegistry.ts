import { iconNames } from "lucide-react/dynamic";

const ICON_NAME_SET = new Set<string>(iconNames);

/** 排序后的 Lucide kebab-case 名称（模块级只算一次） */
export const LUCIDE_ICON_NAMES: readonly string[] = [...iconNames].sort((a, b) =>
  a.localeCompare(b),
);

const LABEL_CACHE = new Map<string, string>();

/** kebab-case → 可读标题（如 folder-git-2 → Folder Git 2） */
export function formatLucideIconLabel(name: string): string {
  const cached = LABEL_CACHE.get(name);
  if (cached) {
    return cached;
  }
  const label = name
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
  LABEL_CACHE.set(name, label);
  return label;
}

export function isValidLucideIconName(name: string): boolean {
  return ICON_NAME_SET.has(name);
}

/** 宽松长度与 kebab 格式（与 Rust 侧对齐；不依赖完整名称表） */
export function looksLikeLucideIconName(name: string): boolean {
  if (name.length === 0 || name.length > 64) {
    return false;
  }
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

export function filterLucideIconNames(
  query: string,
  names: readonly string[] = LUCIDE_ICON_NAMES,
): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...names];
  }
  return names.filter((name) => {
    if (name.includes(needle)) {
      return true;
    }
    return formatLucideIconLabel(name).toLowerCase().includes(needle);
  });
}

/** 选择器网格列数（多一列缩小单格边长，便于正方形不显臃肿） */
export const LUCIDE_ICON_GRID_COLUMNS = 6;
/** 每页行数 */
export const LUCIDE_ICON_GRID_ROWS = 5;
/** 每页图标数（6×5，配合页码分页） */
export const LUCIDE_ICON_PAGE_SIZE = LUCIDE_ICON_GRID_COLUMNS * LUCIDE_ICON_GRID_ROWS;
