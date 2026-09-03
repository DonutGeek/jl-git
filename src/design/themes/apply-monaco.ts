import type { MonacoThemeHost } from "@/types/monaco";

import { isDocumentDark, withAlpha } from "@/design/themes/color-utils";
import { getAppThemePack, usesNativeDesignTokens } from "@/design/themes/registry";
import type { AppThemeChrome, AppThemeId } from "@/design/themes/types";
import { applyJlGitMonacoTheme, forceMonacoThemeRepaint } from "@/design/monaco.theme";

export interface AppMonacoTokenRule {
  token: string;
  foreground: string;
  fontStyle?: string;
}

function monacoForeground(hex: string): string {
  return hex.replace("#", "");
}

/**
 * Monaco standalone 识别的是 token 前缀，不是 VS Code 的完整 TextMate scope。
 * 这里覆盖各语言都会稳定产出的核心类别，未命中的继续继承 Monaco 基础主题。
 */
export function getAppMonacoSyntaxRules(themeId: AppThemeId, dark: boolean): AppMonacoTokenRule[] {
  const pack = getAppThemePack(themeId);
  const syntax = dark ? pack.syntax?.dark : pack.syntax?.light;
  if (!syntax) {
    return [];
  }

  const foreground = (color: string): string => monacoForeground(color);
  return [
    {
      token: "comment",
      foreground: foreground(syntax.comment),
      fontStyle: "italic",
    },
    { token: "keyword", foreground: foreground(syntax.keyword) },
    { token: "keyword.control", foreground: foreground(syntax.keyword) },
    { token: "storage", foreground: foreground(syntax.keyword) },
    { token: "storage.type", foreground: foreground(syntax.type) },
    { token: "string", foreground: foreground(syntax.string) },
    { token: "string.escape", foreground: foreground(syntax.string) },
    { token: "string.regexp", foreground: foreground(syntax.regexp) },
    { token: "regexp", foreground: foreground(syntax.regexp) },
    { token: "number", foreground: foreground(syntax.number) },
    { token: "constant", foreground: foreground(syntax.number) },
    { token: "constant.numeric", foreground: foreground(syntax.number) },
    { token: "type", foreground: foreground(syntax.type) },
    { token: "type.identifier", foreground: foreground(syntax.type) },
    { token: "class", foreground: foreground(syntax.type) },
    { token: "namespace", foreground: foreground(syntax.type) },
    { token: "support.type", foreground: foreground(syntax.type) },
    { token: "function", foreground: foreground(syntax.function) },
    { token: "function.call", foreground: foreground(syntax.function) },
    { token: "method", foreground: foreground(syntax.function) },
    { token: "support.function", foreground: foreground(syntax.function) },
    { token: "variable", foreground: foreground(syntax.variable) },
    { token: "property", foreground: foreground(syntax.variable) },
    { token: "tag", foreground: foreground(syntax.tag) },
    { token: "attribute.name", foreground: foreground(syntax.attribute) },
    { token: "operator", foreground: foreground(syntax.operator) },
    { token: "delimiter", foreground: foreground(syntax.operator) },
  ];
}

/**
 * Monaco 主题名。
 * 鲸灵 Git 始终使用从当前 CSS Tokens 解析的内置 jlgit-*；
 * 其它主题包使用 jlgit-app-*。
 */
export function getAppMonacoThemeName(
  themeId: AppThemeId,
  dark = isDocumentDark(),
  _chrome: AppThemeChrome | null = null,
): string {
  if (usesNativeDesignTokens(themeId)) {
    return dark ? "jlgit-dark" : "jlgit-light";
  }
  return `jlgit-app-${themeId}-${dark ? "dark" : "light"}`;
}
export const getEditorMonacoThemeName = getAppMonacoThemeName;

/** 按当前 chrome 定义并切换 Monaco 主题 */
export function applyAppMonacoTheme(
  monaco: MonacoThemeHost,
  themeId: AppThemeId,
  chrome: AppThemeChrome,
): string {
  if (usesNativeDesignTokens(themeId)) {
    return applyJlGitMonacoTheme(monaco);
  }

  const dark = isDocumentDark();
  const themeName = getAppMonacoThemeName(themeId, dark, chrome);
  const contrast = chrome.contrast / 100;
  const {
    background,
    foreground,
    surface,
    muted,
    mutedForeground,
    border,
    selection,
    diffAdded,
    diffDeleted,
    diffHunk,
  } = chrome;
  const selectionAlpha = 0.25 + contrast * 0.55;
  const lineAlpha = 0.2 + contrast * 0.35;

  monaco.editor.defineTheme(themeName, {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: getAppMonacoSyntaxRules(themeId, dark),
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editorLineNumber.foreground": mutedForeground,
      "editorLineNumber.activeForeground": foreground,
      "editorGutter.background": background,
      "editor.lineHighlightBackground": withAlpha(selection, lineAlpha),
      "editor.selectionBackground": withAlpha(selection, selectionAlpha),
      "editor.inactiveSelectionBackground": withAlpha(selection, selectionAlpha * 0.55),
      "editor.findMatchBackground": selection,
      "editor.findMatchHighlightBackground": withAlpha(selection, 0.65),
      "editorWidget.background": surface,
      "editorWidget.foreground": foreground,
      "editorWidget.border": border,
      "editorHoverWidget.background": surface,
      "editorHoverWidget.foreground": foreground,
      "editorHoverWidget.border": border,
      "editorSuggestWidget.background": surface,
      "editorSuggestWidget.foreground": foreground,
      "editorSuggestWidget.selectedBackground": muted,
      "editorBracketMatch.background": withAlpha(selection, 0.35 + contrast * 0.3),
      "editorBracketMatch.border": border,
      "editorIndentGuide.background1": withAlpha(border, 0.6),
      "editorIndentGuide.activeBackground1": mutedForeground,
      "scrollbarSlider.background": withAlpha(mutedForeground, 0.25),
      "scrollbarSlider.hoverBackground": withAlpha(mutedForeground, 0.4),
      "scrollbarSlider.activeBackground": withAlpha(mutedForeground, 0.55),
      "diffEditor.insertedTextBackground": withAlpha(diffAdded, 0.55),
      "diffEditor.removedTextBackground": withAlpha(diffDeleted, 0.55),
      "diffEditor.insertedLineBackground": withAlpha(diffAdded, 0.75),
      "diffEditor.removedLineBackground": withAlpha(diffDeleted, 0.75),
      "diffEditor.diagonalFill": withAlpha(diffHunk, 0.5),
      "diffEditorGutter.insertedLineBackground": withAlpha(diffAdded, 0.9),
      "diffEditorGutter.removedLineBackground": withAlpha(diffDeleted, 0.9),
    },
  });

  monaco.editor.setTheme(themeName);
  return themeName;
}

export const applyEditorMonacoTheme = applyAppMonacoTheme;

export { forceMonacoThemeRepaint };
