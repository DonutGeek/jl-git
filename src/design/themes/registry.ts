import { isDocumentDark, normalizeContrast, normalizeHexColor } from "@/design/themes/color-utils";
import { APP_THEME_PACKS } from "@/design/themes/packs";
import {
  APP_THEME_CLAUDE_CODE,
  APP_THEME_VSCODE,
  DEFAULT_APP_THEME_ID,
  type AppThemeChrome,
  type AppThemeId,
  type AppThemePack,
  type AppThemePalette,
} from "@/design/themes/types";

const THEME_IDS = new Set<string>(APP_THEME_PACKS.map((pack) => pack.id));

const APP_THEME_CHROME_COLOR_KEYS = [
  "accent",
  "background",
  "foreground",
  "surface",
  "muted",
  "mutedForeground",
  "border",
  "sidebar",
  "selection",
  "destructive",
  "diffAdded",
  "diffDeleted",
  "diffHunk",
  "gitAdded",
  "gitModified",
  "gitDeleted",
  "gitRenamed",
  "gitUntracked",
  "gitConflict",
] as const satisfies readonly (keyof AppThemeChrome)[];

/** 已下线主题 id → 现主题 */
const LEGACY_THEME_ID: Record<string, AppThemeId> = {
  "high-contrast": APP_THEME_VSCODE,
  soft: APP_THEME_CLAUDE_CODE,
};

export function isAppThemeId(value: unknown): value is AppThemeId {
  return typeof value === "string" && THEME_IDS.has(value);
}
export const isEditorThemeId = isAppThemeId;

export function normalizeAppThemeId(value: unknown): AppThemeId {
  if (typeof value === "string" && LEGACY_THEME_ID[value]) {
    return LEGACY_THEME_ID[value];
  }
  return isAppThemeId(value) ? value : DEFAULT_APP_THEME_ID;
}
export const normalizeEditorThemeId = normalizeAppThemeId;

export function getAppThemePack(themeId: AppThemeId): AppThemePack {
  return APP_THEME_PACKS.find((pack) => pack.id === themeId) ?? APP_THEME_PACKS[0];
}

/** @deprecated 旧名 */
export const getAppThemePreset = getAppThemePack;
export const getEditorThemePreset = getAppThemePack;

export function usesNativeDesignTokens(themeId: AppThemeId): boolean {
  return getAppThemePack(themeId).nativeTokens;
}

/** 色与对比度是否仍等于该包预设（半透明侧栏不计，走 dataset） */
export function isAppThemeChromeAtPreset(
  themeId: AppThemeId,
  chrome: AppThemeChrome,
  dark = isDocumentDark(),
): boolean {
  const preset = chromeFromPreset(themeId, dark);
  return (
    APP_THEME_CHROME_COLOR_KEYS.every(
      (key) => chrome[key].toUpperCase() === preset[key].toUpperCase(),
    ) && chrome.contrast === preset.contrast
  );
}

export function getPresetPalette(themeId: AppThemeId, dark = isDocumentDark()): AppThemePalette {
  const pack = getAppThemePack(themeId);
  return dark ? pack.dark : pack.light;
}

export function chromeFromPreset(themeId: AppThemeId, dark = isDocumentDark()): AppThemeChrome {
  const pack = getAppThemePack(themeId);
  const palette = dark ? pack.dark : pack.light;
  return {
    ...palette,
    translucentSidebar: false,
    contrast: pack.defaultContrast,
  };
}

export function normalizeAppThemeChrome(
  value: Partial<AppThemeChrome> | null | undefined,
  themeId: AppThemeId,
  dark = isDocumentDark(),
): AppThemeChrome {
  const base = chromeFromPreset(themeId, dark);
  if (!value) {
    return base;
  }
  return {
    accent: normalizeHexColor(value.accent, base.accent),
    background: normalizeHexColor(value.background, base.background),
    foreground: normalizeHexColor(value.foreground, base.foreground),
    surface: normalizeHexColor(value.surface, base.surface),
    muted: normalizeHexColor(value.muted, base.muted),
    mutedForeground: normalizeHexColor(value.mutedForeground, base.mutedForeground),
    border: normalizeHexColor(value.border, base.border),
    sidebar: normalizeHexColor(value.sidebar, base.sidebar),
    selection: normalizeHexColor(value.selection, base.selection),
    destructive: normalizeHexColor(value.destructive, base.destructive),
    diffAdded: normalizeHexColor(value.diffAdded, base.diffAdded),
    diffDeleted: normalizeHexColor(value.diffDeleted, base.diffDeleted),
    diffHunk: normalizeHexColor(value.diffHunk, base.diffHunk),
    gitAdded: normalizeHexColor(value.gitAdded, base.gitAdded),
    gitModified: normalizeHexColor(value.gitModified, base.gitModified),
    gitDeleted: normalizeHexColor(value.gitDeleted, base.gitDeleted),
    gitRenamed: normalizeHexColor(value.gitRenamed, base.gitRenamed),
    gitUntracked: normalizeHexColor(value.gitUntracked, base.gitUntracked),
    gitConflict: normalizeHexColor(value.gitConflict, base.gitConflict),
    translucentSidebar: Boolean(value.translucentSidebar),
    contrast: normalizeContrast(value.contrast, base.contrast),
  };
}
export const normalizeEditorChrome = normalizeAppThemeChrome;

/** 设置下拉选项 */
export const APP_THEME_OPTIONS = APP_THEME_PACKS.map((pack) => ({
  id: pack.id,
  labelKey: pack.labelKey,
}));

/** 内置色板的建议色，供自定义颜色选择器复用。 */
export const APP_THEME_COLOR_SUGGESTIONS = Array.from(
  new Set([
    ...APP_THEME_PACKS.map((pack) => pack.light.accent),
    ...APP_THEME_PACKS.map((pack) => pack.dark.accent),
    ...APP_THEME_PACKS.map((pack) => pack.light.background),
    ...APP_THEME_PACKS.map((pack) => pack.light.foreground),
    ...APP_THEME_PACKS.map((pack) => pack.dark.background),
    ...APP_THEME_PACKS.map((pack) => pack.dark.foreground),
  ]),
);
export const EDITOR_THEME_OPTIONS = APP_THEME_OPTIONS;
/** @deprecated */
export const APP_THEME_PRESETS = APP_THEME_PACKS;
export const EDITOR_THEME_PRESETS = APP_THEME_PACKS;
