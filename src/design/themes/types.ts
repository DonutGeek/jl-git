/**
 * 应用主题类型。
 * 新增主题：在 packs/ 加文件，再挂到 packs/index.ts，勿改本文件业务逻辑。
 */

export const APP_THEME_JINGLING_GIT = "jingling-git" as const;
export const APP_THEME_GITHUB = "github" as const;
export const APP_THEME_CODEX = "codex" as const;
export const APP_THEME_CLAUDE_CODE = "claude-code" as const;
export const APP_THEME_VSCODE = "vscode" as const;

export type AppThemeId =
  | typeof APP_THEME_JINGLING_GIT
  | typeof APP_THEME_GITHUB
  | typeof APP_THEME_CODEX
  | typeof APP_THEME_CLAUDE_CODE
  | typeof APP_THEME_VSCODE;

/** @deprecated 兼容旧名 */
export type EditorThemeId = AppThemeId;

export const DEFAULT_APP_THEME_ID: AppThemeId = APP_THEME_JINGLING_GIT;
export const DEFAULT_EDITOR_THEME_ID = DEFAULT_APP_THEME_ID;
export const EDITOR_THEME_JINGLING_GIT = APP_THEME_JINGLING_GIT;

export interface AppThemePalette {
  accent: string;
  background: string;
  foreground: string;
  surface: string;
  muted: string;
  mutedForeground: string;
  border: string;
  sidebar: string;
  selection: string;
  destructive: string;
  diffAdded: string;
  diffDeleted: string;
  diffHunk: string;
  gitAdded: string;
  gitModified: string;
  gitDeleted: string;
  gitRenamed: string;
  gitUntracked: string;
  gitConflict: string;
}

export interface AppThemeChrome extends AppThemePalette {
  translucentSidebar: boolean;
  /** 0–100 */
  contrast: number;
}

/** Monaco 语法高亮色；Diff 行背景仍由 AppThemePalette 控制。 */
export interface AppThemeSyntaxPalette {
  comment: string;
  keyword: string;
  string: string;
  number: string;
  type: string;
  function: string;
  variable: string;
  tag: string;
  attribute: string;
  regexp: string;
  operator: string;
}

/** @deprecated */
export type EditorThemeChrome = AppThemeChrome;
/** @deprecated */
export type EditorThemePalette = AppThemePalette;

/** 单个主题包定义：只描述数据，不含副作用 */
export interface AppThemePack {
  id: AppThemeId;
  labelKey: string;
  /**
   * true：未自定义色时沿用 tokens.css（鲸灵 Git）；用户改色后仍写 chrome 覆写
   */
  nativeTokens: boolean;
  light: AppThemePalette;
  dark: AppThemePalette;
  /** nativeTokens 主题省略时继续使用项目原生 Monaco 规则。 */
  syntax?: {
    light: AppThemeSyntaxPalette;
    dark: AppThemeSyntaxPalette;
  };
  defaultContrast: number;
}
