import type { CSSProperties } from "react";

import {
  hexToHsl,
  hslToHex,
  isDocumentDark,
  normalizeHexColor,
  withAlpha,
} from "@/design/themes/color-utils";

import type { WorkspaceColor } from "@/types/project";

export const DEFAULT_WORKSPACE_COLOR = "#5F75C1" as const satisfies WorkspaceColor;

/** 分组颜色弹窗预设（蓝 / 绿 / 橙 / 紫 / 红） */
export const WORKSPACE_COLOR_PRESETS = [
  "#5F75C1",
  "#4E925E",
  "#D27830",
  "#AA6BAE",
  "#CD6055",
] as const satisfies readonly WorkspaceColor[];

const LEGACY_WORKSPACE_COLORS: Readonly<Record<string, WorkspaceColor>> = {
  blue: "#5F75C1",
  green: "#4E925E",
  orange: "#D27830",
  purple: "#AA6BAE",
  red: "#CD6055",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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

/**
 * 按昼夜主题调整分组色明度，便于徽章/色点可读。
 * 库内仍存用户原始 HEX；此处只用于展示。
 */
export function adaptWorkspaceColorForTheme(
  value: unknown,
  dark: boolean = isDocumentDark(),
): WorkspaceColor {
  const base = normalizeWorkspaceColor(value);
  const { hue, saturation, lightness } = hexToHsl(base);

  let nextLightness: number;
  let nextSaturation = saturation;
  if (dark) {
    // 暗色界面：抬明度，略收饱和避免荧光
    nextLightness = clamp(lightness, 58, 78);
    if (lightness < 58) {
      nextLightness = 58 + (58 - lightness) * 0.15;
      nextLightness = clamp(nextLightness, 58, 72);
    }
    nextSaturation = clamp(saturation * 0.92, 0, 100);
  } else {
    // 亮色界面：压明度，保证浅底可读
    nextLightness = clamp(lightness, 38, 52);
    if (lightness > 52) {
      nextLightness = 52 - (lightness - 52) * 0.12;
      nextLightness = clamp(nextLightness, 40, 52);
    }
  }

  return hslToHex(hue, nextSaturation, nextLightness) as WorkspaceColor;
}

export function workspaceColorTint(value: unknown, dark: boolean = isDocumentDark()): string {
  const adapted = adaptWorkspaceColorForTheme(value, dark);
  return withAlpha(adapted, dark ? 0.22 : 0.14);
}

export function workspaceColorRing(value: unknown, dark: boolean = isDocumentDark()): string {
  const adapted = adaptWorkspaceColorForTheme(value, dark);
  return withAlpha(adapted, dark ? 0.55 : 0.45);
}

/** 徽章用：前景 + 底色（均已按主题适配） */
export function workspaceBadgeStyle(
  value: unknown,
  dark: boolean = isDocumentDark(),
): Pick<CSSProperties, "color" | "backgroundColor"> {
  const color = adaptWorkspaceColorForTheme(value, dark);
  return {
    color,
    backgroundColor: withAlpha(color, dark ? 0.22 : 0.14),
  };
}
