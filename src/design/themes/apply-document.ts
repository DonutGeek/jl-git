/** 旧主题包曾写入的语义 Token；启动时清掉，避免覆盖 antd / tokens.css */
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
  "--syntax-comment",
  "--syntax-keyword",
  "--syntax-string",
  "--syntax-number",
  "--syntax-type",
  "--syntax-function",
  "--syntax-variable",
  "--syntax-tag",
  "--syntax-attribute",
  "--syntax-regexp",
  "--syntax-operator",
] as const;

/** 旧首屏主题包快照键；工厂重置仍会清掉 */
export const APP_THEME_BOOT_STORAGE_KEY = "jlgit-app-theme-boot";

/** 去掉主题包写入的 inline Token，并删除 boot 快照 */
export function clearAppThemeTokenOverrides(): void {
  const root = document.documentElement;
  for (const prop of APP_THEME_TOKEN_PROPS) {
    root.style.removeProperty(prop);
  }
  delete root.dataset.appTheme;
  delete root.dataset.sidebarTranslucent;
  delete root.dataset.appThemeContrast;
  try {
    localStorage.removeItem(APP_THEME_BOOT_STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}
