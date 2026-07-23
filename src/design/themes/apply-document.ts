import {
  contrastingForeground,
  isDocumentDark,
  withAlpha,
} from "@/design/themes/color-utils";
import {
  chromeFromPreset,
  usesNativeDesignTokens,
} from "@/design/themes/registry";
import {
  DEFAULT_APP_THEME_ID,
  type AppThemeChrome,
  type AppThemeId,
  type AppThemePalette,
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
  "--destructive",
  "--border",
  "--input",
  "--ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--workspace-blue",
  "--workspace-green",
  "--workspace-orange",
  "--workspace-purple",
  "--workspace-red",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
  "--diff-add",
  "--diff-del",
  "--diff-hunk",
  "--git-added",
  "--git-modified",
  "--git-deleted",
  "--git-renamed",
  "--git-untracked",
  "--git-conflict",
  "--editor-theme-accent",
] as const;

type AppThemeTokenProp = (typeof APP_THEME_TOKEN_PROPS)[number];
type AppThemeTokenOverrides = Partial<Record<AppThemeTokenProp, string>>;

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
 * 鲸灵 Git 以 tokens.css 为唯一原色源。
 * 用户微调时只返回确实变化的 Token，避免一处改色把整套原生 OKLCH 覆盖成近似 HEX。
 */
export function getNativeAppThemeTokenOverrides(
  themeId: AppThemeId,
  chrome: AppThemeChrome,
  dark: boolean,
): AppThemeTokenOverrides {
  const preset = chromeFromPreset(themeId, dark);
  const overrides: AppThemeTokenOverrides = {};
  const changed = (key: keyof AppThemePalette): boolean =>
    chrome[key].toUpperCase() !== preset[key].toUpperCase();
  const set = (prop: AppThemeTokenProp, value: string): void => {
    overrides[prop] = value;
  };

  if (changed("background")) {
    set("--background", chrome.background);
  }
  if (changed("foreground")) {
    set("--foreground", chrome.foreground);
    set("--card-foreground", chrome.foreground);
    set("--popover-foreground", chrome.foreground);
    set("--secondary-foreground", chrome.foreground);
    set("--accent-foreground", chrome.foreground);
    set("--sidebar-foreground", chrome.foreground);
    set("--sidebar-accent-foreground", chrome.foreground);
  }
  if (changed("surface")) {
    set("--card", chrome.surface);
    set("--popover", chrome.surface);
  }
  if (changed("muted")) {
    set("--secondary", chrome.muted);
    set("--muted", chrome.muted);
  }
  if (changed("mutedForeground")) {
    set("--muted-foreground", chrome.mutedForeground);
  }
  if (changed("border")) {
    set("--border", chrome.border);
    set("--input", chrome.border);
    set("--sidebar-border", chrome.border);
  }
  if (changed("selection")) {
    set("--accent", chrome.selection);
    set("--sidebar-accent", chrome.selection);
  }
  if (changed("destructive")) {
    set("--destructive", chrome.destructive);
  }

  if (changed("accent")) {
    const accentForeground = contrastingForeground(chrome.accent);
    set("--primary", chrome.accent);
    set("--primary-foreground", accentForeground);
    set("--ring", chrome.accent);
    set("--chart-1", chrome.accent);
    set("--sidebar-primary", chrome.accent);
    set("--sidebar-primary-foreground", accentForeground);
    set("--sidebar-ring", chrome.accent);
    set("--editor-theme-accent", chrome.accent);
  }
  if (changed("sidebar") || chrome.translucentSidebar) {
    set(
      "--sidebar",
      chrome.translucentSidebar
        ? withAlpha(chrome.sidebar, dark ? 0.72 : 0.78)
        : chrome.sidebar,
    );
  }

  if (changed("diffAdded")) {
    set("--diff-add", chrome.diffAdded);
  }
  if (changed("diffDeleted")) {
    set("--diff-del", chrome.diffDeleted);
  }
  if (changed("diffHunk")) {
    set("--diff-hunk", chrome.diffHunk);
  }
  if (changed("gitAdded")) {
    set("--git-added", chrome.gitAdded);
    set("--chart-2", chrome.gitAdded);
    set("--workspace-green", chrome.gitAdded);
  }
  if (changed("gitModified")) {
    set("--git-modified", chrome.gitModified);
    set("--chart-3", chrome.gitModified);
    set("--workspace-blue", chrome.gitModified);
  }
  if (changed("gitDeleted")) {
    set("--git-deleted", chrome.gitDeleted);
    set("--workspace-red", chrome.gitDeleted);
  }
  if (changed("gitRenamed")) {
    set("--git-renamed", chrome.gitRenamed);
    set("--chart-4", chrome.gitRenamed);
    set("--workspace-purple", chrome.gitRenamed);
  }
  if (changed("gitUntracked")) {
    set("--git-untracked", chrome.gitUntracked);
  }
  if (changed("gitConflict")) {
    set("--git-conflict", chrome.gitConflict);
    set("--chart-5", chrome.gitConflict);
    set("--workspace-orange", chrome.gitConflict);
  }

  return overrides;
}

/**
 * 把主题写入整站 Design Tokens。
 * 鲸灵 Git 始终以 tokens.css 为底，只增量覆盖用户实际修改的项。
 * 其它主题按 chrome 写入完整主题包。
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

  const dark = isDocumentDark();
  if (usesNativeDesignTokens(themeId)) {
    const overrides = getNativeAppThemeTokenOverrides(themeId, chrome, dark);
    for (const [prop, value] of Object.entries(overrides)) {
      root.style.setProperty(prop, value);
    }
    persistAppThemeBootSnapshot(
      themeId,
      chrome,
      Object.keys(overrides).length === 0,
    );
    return;
  }

  const {
    accent,
    background,
    foreground,
    surface,
    muted,
    mutedForeground,
    border,
    sidebar,
    selection,
    destructive,
    diffAdded,
    diffDeleted,
    diffHunk,
    gitAdded,
    gitModified,
    gitDeleted,
    gitRenamed,
    gitUntracked,
    gitConflict,
    translucentSidebar,
  } = chrome;
  const primaryFg = contrastingForeground(accent);

  root.style.setProperty("--background", background);
  root.style.setProperty("--foreground", foreground);
  root.style.setProperty("--card", surface);
  root.style.setProperty("--card-foreground", foreground);
  root.style.setProperty("--popover", surface);
  root.style.setProperty("--popover-foreground", foreground);
  root.style.setProperty("--primary", accent);
  root.style.setProperty("--primary-foreground", primaryFg);
  root.style.setProperty("--secondary", muted);
  root.style.setProperty("--secondary-foreground", foreground);
  root.style.setProperty("--muted", muted);
  root.style.setProperty("--muted-foreground", mutedForeground);
  root.style.setProperty("--accent", selection);
  root.style.setProperty("--accent-foreground", foreground);
  root.style.setProperty("--destructive", destructive);
  root.style.setProperty("--border", border);
  root.style.setProperty("--input", border);
  root.style.setProperty("--ring", accent);
  root.style.setProperty("--chart-1", accent);
  root.style.setProperty("--chart-2", gitAdded);
  root.style.setProperty("--chart-3", gitModified);
  root.style.setProperty("--chart-4", gitRenamed);
  root.style.setProperty("--chart-5", gitConflict);
  root.style.setProperty("--workspace-blue", gitModified);
  root.style.setProperty("--workspace-green", gitAdded);
  root.style.setProperty("--workspace-orange", gitConflict);
  root.style.setProperty("--workspace-purple", gitRenamed);
  root.style.setProperty("--workspace-red", gitDeleted);
  root.style.setProperty(
    "--sidebar",
    translucentSidebar
      ? withAlpha(sidebar, dark ? 0.72 : 0.78)
      : sidebar,
  );
  root.style.setProperty("--sidebar-foreground", foreground);
  root.style.setProperty("--sidebar-primary", accent);
  root.style.setProperty("--sidebar-primary-foreground", primaryFg);
  root.style.setProperty("--sidebar-accent", selection);
  root.style.setProperty("--sidebar-accent-foreground", foreground);
  root.style.setProperty("--sidebar-border", border);
  root.style.setProperty("--sidebar-ring", accent);
  root.style.setProperty("--diff-add", diffAdded);
  root.style.setProperty("--diff-del", diffDeleted);
  root.style.setProperty("--diff-hunk", diffHunk);
  root.style.setProperty("--git-added", gitAdded);
  root.style.setProperty("--git-modified", gitModified);
  root.style.setProperty("--git-deleted", gitDeleted);
  root.style.setProperty("--git-renamed", gitRenamed);
  root.style.setProperty("--git-untracked", gitUntracked);
  root.style.setProperty("--git-conflict", gitConflict);
  root.style.setProperty("--editor-theme-accent", accent);

  persistAppThemeBootSnapshot(themeId, chrome, false);
}

/** @deprecated */
export const applyEditorChromeToDocument = (chrome: AppThemeChrome): void => {
  applyAppThemeToDocument(DEFAULT_APP_THEME_ID, chrome);
};
