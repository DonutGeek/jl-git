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
}

export interface AppThemeChrome {
  accent: string;
  background: string;
  foreground: string;
  translucentSidebar: boolean;
  /** 0–100 */
  contrast: number;
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
  defaultContrast: number;
}
