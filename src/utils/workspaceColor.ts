import { normalizeHexColor } from "@/design/themes/color-utils";

/** 分组颜色弹窗预设（蓝 / 绿 / 橙 / 紫 / 红） */
export const WORKSPACE_COLOR_PRESETS = [
  "#5F75C1",
  "#4E925E",
  "#D27830",
  "#AA6BAE",
  "#CD6055",
] as const;

/** 合法则返回规范化 #RRGGBB，否则 null（空串、非法值都算未选） */
export function parseWorkspaceColor(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return normalizeHexColor(value, "") || null;
}
