import { normalizeHexColor, withAlpha } from "@/design/themes/color-utils";

import type { WorkspaceColor } from "@/types/project";

export const DEFAULT_WORKSPACE_COLOR = "#5F75C1" as const satisfies WorkspaceColor;

const LEGACY_WORKSPACE_COLORS: Readonly<Record<string, WorkspaceColor>> = {
  blue: "#5F75C1",
  green: "#4E925E",
  orange: "#D27830",
  purple: "#AA6BAE",
  red: "#CD6055",
};

export function parseWorkspaceColor(value: unknown): WorkspaceColor | null {
  if (typeof value !== "string") {
    return null;
  }
  const legacy = LEGACY_WORKSPACE_COLORS[value.trim().toLowerCase()];
  if (legacy) {
    return legacy;
  }
  const normalized = normalizeHexColor(value, "");
  return normalized ? (normalized as WorkspaceColor) : null;
}

export function normalizeWorkspaceColor(value: unknown): WorkspaceColor {
  return parseWorkspaceColor(value) ?? DEFAULT_WORKSPACE_COLOR;
}

export function requireWorkspaceColor(value: unknown): WorkspaceColor {
  const normalized = parseWorkspaceColor(value);
  if (!normalized) {
    throw new Error("工作区颜色必须是 #RRGGBB 格式");
  }
  return normalized;
}

export function workspaceColorTint(value: unknown): string {
  return withAlpha(normalizeWorkspaceColor(value), 0.2);
}

export function workspaceColorRing(value: unknown): string {
  return withAlpha(normalizeWorkspaceColor(value), 0.5);
}
