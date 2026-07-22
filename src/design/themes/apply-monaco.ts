import type { Monaco } from "@monaco-editor/react";

import {
  isDocumentDark,
  mixToward,
  withAlpha,
} from "@/design/themes/color-utils";
import {
  isAppThemeChromeAtPreset,
  usesNativeDesignTokens,
} from "@/design/themes/registry";
import type { AppThemeChrome, AppThemeId } from "@/design/themes/types";
import {
  applyJlGitMonacoTheme,
  forceMonacoThemeRepaint,
} from "@/design/monaco.theme";

/**
 * Monaco 主题名。
 * 鲸灵 Git 未改色 → 内置 jlgit-*；改色或其它包 → jlgit-app-*。
 */
export function getAppMonacoThemeName(
  themeId: AppThemeId,
  dark = isDocumentDark(),
  chrome: AppThemeChrome | null = null,
): string {
  if (
    usesNativeDesignTokens(themeId) &&
    (chrome == null || isAppThemeChromeAtPreset(themeId, chrome, dark))
  ) {
    return dark ? "jlgit-dark" : "jlgit-light";
  }
  return `jlgit-app-${themeId}-${dark ? "dark" : "light"}`;
}
export const getEditorMonacoThemeName = getAppMonacoThemeName;

/** 按当前 chrome 定义并切换 Monaco 主题 */
export function applyAppMonacoTheme(
  monaco: Monaco,
  themeId: AppThemeId,
  chrome: AppThemeChrome,
): string {
  if (
    usesNativeDesignTokens(themeId) &&
    isAppThemeChromeAtPreset(themeId, chrome)
  ) {
    return applyJlGitMonacoTheme(monaco);
  }

  const dark = isDocumentDark();
  const themeName = getAppMonacoThemeName(themeId, dark, chrome);
  const contrast = chrome.contrast / 100;
  const { background, foreground, accent } = chrome;
  const muted = mixToward(background, foreground, dark ? 0.18 : 0.08);
  const mutedFg = mixToward(foreground, background, 0.35);
  const border = mixToward(background, foreground, dark ? 0.22 : 0.12);
  const selectionAlpha = 0.25 + contrast * 0.55;
  const lineAlpha = 0.2 + contrast * 0.35;
  const diffAdd = dark ? "#1A3D2A" : "#E6F4EA";
  const diffDel = dark ? "#4A2020" : "#FCE8E6";
  const diffHunk = dark ? "#1E2A3A" : "#EEF2F7";

  monaco.editor.defineTheme(themeName, {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editorLineNumber.foreground": mutedFg,
      "editorLineNumber.activeForeground": foreground,
      "editorGutter.background": background,
      "editor.lineHighlightBackground": withAlpha(accent, lineAlpha),
      "editor.selectionBackground": withAlpha(accent, selectionAlpha),
      "editor.inactiveSelectionBackground": withAlpha(
        accent,
        selectionAlpha * 0.55,
      ),
      "editorWidget.background": muted,
      "editorWidget.border": border,
      "editorBracketMatch.background": withAlpha(accent, 0.35 + contrast * 0.3),
      "editorBracketMatch.border": border,
      "editorIndentGuide.background1": withAlpha(border, 0.6),
      "editorIndentGuide.activeBackground1": mutedFg,
      "scrollbarSlider.background": withAlpha(mutedFg, 0.25),
      "scrollbarSlider.hoverBackground": withAlpha(mutedFg, 0.4),
      "scrollbarSlider.activeBackground": withAlpha(mutedFg, 0.55),
      "diffEditor.insertedTextBackground": withAlpha(diffAdd, 0.55),
      "diffEditor.removedTextBackground": withAlpha(diffDel, 0.55),
      "diffEditor.insertedLineBackground": withAlpha(diffAdd, 0.75),
      "diffEditor.removedLineBackground": withAlpha(diffDel, 0.75),
      "diffEditor.diagonalFill": withAlpha(diffHunk, 0.5),
      "diffEditorGutter.insertedLineBackground": withAlpha(diffAdd, 0.9),
      "diffEditorGutter.removedLineBackground": withAlpha(diffDel, 0.9),
    },
  });

  monaco.editor.setTheme(themeName);
  return themeName;
}

export const applyEditorMonacoTheme = applyAppMonacoTheme;

export { forceMonacoThemeRepaint };
