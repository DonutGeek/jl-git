import * as LucideIcons from "lucide";

import type { IconNode } from "lucide";

function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function isIconNode(value: unknown): value is IconNode {
  return Array.isArray(value);
}

/** 按 PascalCase / kebab-case 解析 Lucide 图标数据，找不到时回退问号 */
export function resolveLucideIconNode(name: string): IconNode {
  const key = toPascalCase(name) as keyof typeof LucideIcons;
  const icon = LucideIcons[key];
  if (isIconNode(icon)) {
    return icon;
  }
  return LucideIcons.CircleHelp;
}
