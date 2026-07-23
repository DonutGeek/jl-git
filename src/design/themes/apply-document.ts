import {
  contrastingForeground,
  isDocumentDark,
  mixToward,
  withAlpha,
} from "@/design/themes/color-utils";
import {
  isAppThemeChromeAtPreset,
  usesNativeDesignTokens,
} from "@/design/themes/registry";
import {
  DEFAULT_APP_THEME_ID,
  type AppThemeChrome,
  type AppThemeId,
} from "@/design/themes/types";

/** 主题包会注入的语义 Token；切回原色 / 切换主题前全部 remove */
const APP_THEME_TOKEN_PROPS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
  "--input",
  "--ring",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
  "--editor-theme-accent",
] as const;

/** 首屏脚本读取，避免非默认主题冷启动闪「原色」 */
export const APP_THEME_BOOT_STORAGE_KEY = "jlgit-app-theme-boot";

interface AppThemeBootSnapshot {
  dark: boolean;
  themeId: string;
  /** true：无 inline 覆写，沿用 tokens.css */
  native: boolean;
  vars: Record<string, string>;
  sidebarTranslucent: boolean;
  contrast: string;
}

function persistAppThemeBootSnapshot(
  themeId: AppThemeId,
  chrome: AppThemeChrome,
  native: boolean,
): void {
  const root = document.documentElement;
  const vars: Record<string, string> = {};
  if (!native) {
    for (const prop of APP_THEME_TOKEN_PROPS) {
      const value = root.style.getPropertyValue(prop).trim();
      if (value) {
        vars[prop] = value;
      }
    }
  }
  const snapshot: AppThemeBootSnapshot = {
    dark: isDocumentDark(),
    themeId,
    native,
    vars,
    sidebarTranslucent: chrome.translucentSidebar,
    contrast: String(chrome.contrast),
  };
  try {
    localStorage.setItem(APP_THEME_BOOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private mode
  }
}

export function clearAppThemeTokenOverrides(): void {
  const root = document.documentElement;
  for (const prop of APP_THEME_TOKEN_PROPS) {
    root.style.removeProperty(prop);
  }
}

/**
 * 把主题写入整站 Design Tokens。
 * 鲸灵 Git 未改色时：清除 inline，沿用 tokens.css（不要用 hex 近似顶掉原色）。
 * 其它主题 / 用户微调后：按 chrome 写入。
 */
export function applyAppThemeToDocument(
  themeId: AppThemeId,
  chrome: AppThemeChrome,
): void {
  const root = document.documentElement;
  root.dataset.appTheme = themeId;
  root.dataset.sidebarTranslucent = chrome.translucentSidebar
    ? "true"
    : "false";
  root.dataset.appThemeContrast = String(chrome.contrast);

  clearAppThemeTokenOverrides();

  const useNative =
    usesNativeDesignTokens(themeId) &&
    isAppThemeChromeAtPreset(themeId, chrome);

  if (useNative) {
    persistAppThemeBootSnapshot(themeId, chrome, true);
    return;
  }

  const dark = isDocumentDark();
  const { accent, background, foreground, contrast, translucentSidebar } =
    chrome;
  const muted = mixToward(background, foreground, dark ? 0.14 : 0.06);
  const mutedFg = mixToward(foreground, background, 0.38 - contrast / 400);
  const border = mixToward(background, foreground, dark ? 0.2 : 0.1);
  const card = mixToward(background, foreground, dark ? 0.05 : 0.02);
  const secondary = mixToward(background, foreground, dark ? 0.1 : 0.05);
  const primaryFg = contrastingForeground(accent);

  root.style.setProperty("--background", background);
  root.style.setProperty("--foreground", foreground);
  root.style.setProperty("--card", card);
  root.style.setProperty("--card-foreground", foreground);
  root.style.setProperty("--popover", card);
  root.style.setProperty("--popover-foreground", foreground);
  root.style.setProperty("--primary", accent);
  root.style.setProperty("--primary-foreground", primaryFg);
  root.style.setProperty("--secondary", secondary);
  root.style.setProperty("--secondary-foreground", foreground);
  root.style.setProperty("--muted", muted);
  root.style.setProperty("--muted-foreground", mutedFg);
  root.style.setProperty("--accent", mixToward(background, accent, 0.22));
  root.style.setProperty("--accent-foreground", foreground);
  root.style.setProperty("--border", border);
  root.style.setProperty("--input", border);
  root.style.setProperty("--ring", accent);
  const sidebarSolid = mixToward(background, foreground, dark ? 0.08 : 0.03);
  root.style.setProperty(
    "--sidebar",
    translucentSidebar
      ? withAlpha(sidebarSolid, dark ? 0.72 : 0.78)
      : sidebarSolid,
  );
  root.style.setProperty("--sidebar-foreground", foreground);
  root.style.setProperty("--sidebar-primary", accent);
  root.style.setProperty("--sidebar-primary-foreground", primaryFg);
  root.style.setProperty("--sidebar-accent", muted);
  root.style.setProperty("--sidebar-accent-foreground", foreground);
  root.style.setProperty("--sidebar-border", border);
  root.style.setProperty("--sidebar-ring", accent);
  root.style.setProperty("--editor-theme-accent", accent);

  persistAppThemeBootSnapshot(themeId, chrome, false);
}

/** @deprecated */
export const applyEditorChromeToDocument = (chrome: AppThemeChrome): void => {
  applyAppThemeToDocument(DEFAULT_APP_THEME_ID, chrome);
};
