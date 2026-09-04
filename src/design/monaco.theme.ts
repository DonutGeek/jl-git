import type { MonacoThemeHost } from "@/types/monaco";

/** 与 Design Tokens 同步的 Monaco 主题名（明暗分主题，切换时才能强制刷新） */
export const JLGIT_MONACO_THEME_LIGHT = "jlgit-light";
export const JLGIT_MONACO_THEME_DARK = "jlgit-dark";

/** @deprecated 兼容旧引用；请用 getJlGitMonacoThemeName() */
export const JLGIT_MONACO_THEME = JLGIT_MONACO_THEME_LIGHT;

export function getJlGitMonacoThemeName(dark = isDocumentDark()): string {
  return dark ? JLGIT_MONACO_THEME_DARK : JLGIT_MONACO_THEME_LIGHT;
}

function isDocumentDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

/** 将 CSS 变量解析为浏览器计算后的 rgb，再转成 Monaco 可用的 #rrggbb */
function resolveCssColor(varName: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${varName})`;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  return rgbToHex(computed) ?? fallback;
}

function rgbToHex(rgb: string): string | null {
  const match = rgb.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (!match) {
    return null;
  }
  const r = Math.round(Number(match[1]));
  const g = Math.round(Number(match[2]));
  const b = Math.round(Number(match[3]));
  const a = match[4] !== undefined ? Math.round(Number(match[4]) * 255) : null;
  const hex = [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  if (a !== null && a < 255) {
    return `#${hex}${a.toString(16).padStart(2, "0")}`;
  }
  return `#${hex}`;
}

/** 给 #rrggbb 追加透明度（Monaco 支持 #rrggbbaa） */
function withAlpha(hex: string, alpha: number): string {
  const base = hex.replace("#", "").slice(0, 6);
  if (base.length !== 6) {
    return hex;
  }
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${base}${a}`;
}

/**
 * 用当前文档 CSS Variables 定义 / 刷新 Monaco 主题，并设为活动主题。
 * 明暗使用不同 themeName，避免同名改色后不重绘。
 * @returns 当前激活的主题名
 */
export function applyJlGitMonacoTheme(monaco: MonacoThemeHost): string {
  const dark = isDocumentDark();
  const themeName = getJlGitMonacoThemeName(dark);
  const background = resolveCssColor("--background", dark ? "#000000" : "#f5f5f5");
  const foreground = resolveCssColor("--foreground", dark ? "#d9d9d9" : "#1f1f1f");
  const muted = resolveCssColor("--muted", dark ? "#1f1f1f" : "#f5f5f5");
  const mutedFg = resolveCssColor("--muted-foreground", dark ? "#8c8c8c" : "#737373");
  const border = resolveCssColor("--border", dark ? "#424242" : "#d9d9d9");
  const accent = resolveCssColor("--accent", dark ? "#1f1f1f" : "#f5f5f5");
  const diffAdd = resolveCssColor("--diff-add", dark ? "#1a3d2a" : "#e6f4ea");
  const diffDel = resolveCssColor("--diff-del", dark ? "#4a2020" : "#fce8e6");
  const diffHunk = resolveCssColor("--diff-hunk", dark ? "#1e2a3a" : "#eef2f7");

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
      "editor.lineHighlightBackground": withAlpha(accent, 0.45),
      "editor.selectionBackground": withAlpha(accent, 0.85),
      "editor.inactiveSelectionBackground": withAlpha(accent, 0.45),
      "editorWidget.background": muted,
      "editorWidget.border": border,
      "editorBracketMatch.background": withAlpha(accent, 0.6),
      "editorBracketMatch.border": border,
      "editorIndentGuide.background1": withAlpha(border, 0.6),
      "editorIndentGuide.activeBackground1": mutedFg,
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

/** 主题切换后强制编辑器按新主题重绘（避免必须滚动才变色） */
export function forceMonacoThemeRepaint(
  diffEditor: {
    getOriginalEditor: () => { render: (force?: boolean) => void; layout: () => void };
    getModifiedEditor: () => { render: (force?: boolean) => void; layout: () => void };
    layout: () => void;
  } | null,
  fileEditor: { render: (force?: boolean) => void; layout: () => void } | null,
): void {
  if (diffEditor) {
    diffEditor.getOriginalEditor().render(true);
    diffEditor.getModifiedEditor().render(true);
    diffEditor.layout();
  }
  if (fileEditor) {
    fileEditor.render(true);
    fileEditor.layout();
  }
}
