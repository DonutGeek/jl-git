/**
 * 应用主题公共入口。
 *
 * 目录约定：
 * - packs/     每个主题一个文件（只含色板数据）
 * - packs/index.ts  注册表（新增主题只改这里 + 新 pack）
 * - registry.ts     id 校验 / 归一 / 选项
 * - apply-*.ts      副作用（document / Monaco）
 * - types.ts / color-utils.ts  共享类型与色运算
 */

export type {
  AppThemeChrome,
  AppThemeId,
  AppThemePack,
  AppThemePalette,
  AppThemeSyntaxPalette,
  EditorThemeChrome,
  EditorThemeId,
  EditorThemePalette,
} from "@/design/themes/types";

export {
  APP_THEME_CHATGPT,
  APP_THEME_CLAUDE_CODE,
  APP_THEME_CODEX,
  APP_THEME_GITHUB,
  APP_THEME_JINGLING_GIT,
  APP_THEME_VSCODE,
  DEFAULT_APP_THEME_ID,
  DEFAULT_EDITOR_THEME_ID,
  EDITOR_THEME_JINGLING_GIT,
} from "@/design/themes/types";

export { APP_THEME_PACKS } from "@/design/themes/packs";

export {
  APP_THEME_COLOR_SUGGESTIONS,
  APP_THEME_OPTIONS,
  APP_THEME_PRESETS,
  chromeFromPreset,
  EDITOR_THEME_OPTIONS,
  EDITOR_THEME_PRESETS,
  getAppThemePack,
  getAppThemePreset,
  getEditorThemePreset,
  getPresetPalette,
  isAppThemeId,
  isEditorThemeId,
  normalizeAppThemeChrome,
  normalizeAppThemeId,
  normalizeEditorChrome,
  normalizeEditorThemeId,
  isAppThemeChromeAtPreset,
  usesNativeDesignTokens,
} from "@/design/themes/registry";

export {
  contrastingForeground,
  hexToHsv,
  hsvToHex,
  isDocumentDark,
  normalizeContrast,
  normalizeHexColor,
} from "@/design/themes/color-utils";

export {
  applyAppThemeToDocument,
  applyEditorChromeToDocument,
  clearAppThemeTokenOverrides,
} from "@/design/themes/apply-document";

export {
  applyAppMonacoTheme,
  applyEditorMonacoTheme,
  forceMonacoThemeRepaint,
  getAppMonacoSyntaxRules,
  getAppMonacoThemeName,
  getEditorMonacoThemeName,
} from "@/design/themes/apply-monaco";
