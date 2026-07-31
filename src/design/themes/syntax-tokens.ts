import { isDocumentDark } from "@/design/themes/color-utils";
import { getAppThemePack } from "@/design/themes/registry";
import type { AppThemeId, AppThemeSyntaxPalette } from "@/design/themes/types";

/** 与主题管道同步清理 / 写入的 syntax CSS 变量 */
export const SYNTAX_TOKEN_PROPS = [
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

export type SyntaxTokenProp = (typeof SYNTAX_TOKEN_PROPS)[number];

/** 鲸灵 Git（nativeTokens / Monaco inherit）回退色，接近 VS Code 默认观感 */
export const DEFAULT_SYNTAX_LIGHT: AppThemeSyntaxPalette = {
  comment: "#008000",
  keyword: "#AF00DB",
  string: "#A31515",
  number: "#098658",
  type: "#267F99",
  function: "#795E26",
  variable: "#001080",
  tag: "#800000",
  attribute: "#E50000",
  regexp: "#811F3F",
  operator: "#000000",
};

export const DEFAULT_SYNTAX_DARK: AppThemeSyntaxPalette = {
  comment: "#6A9955",
  keyword: "#C586C0",
  string: "#CE9178",
  number: "#B5CEA8",
  type: "#4EC9B0",
  function: "#DCDCAA",
  variable: "#9CDCFE",
  tag: "#569CD6",
  attribute: "#9CDCFE",
  regexp: "#D16969",
  operator: "#D4D4D4",
};

export function resolveSyntaxPalette(
  themeId: AppThemeId,
  dark = isDocumentDark(),
): AppThemeSyntaxPalette {
  const pack = getAppThemePack(themeId);
  const fromPack = dark ? pack.syntax?.dark : pack.syntax?.light;
  return fromPack ?? (dark ? DEFAULT_SYNTAX_DARK : DEFAULT_SYNTAX_LIGHT);
}

/** 把语法色写入 documentElement，供鲸灵代码块 hljs 映射使用 */
export function applySyntaxTokensToDocument(themeId: AppThemeId, dark = isDocumentDark()): void {
  const root = document.documentElement;
  const syntax = resolveSyntaxPalette(themeId, dark);
  root.style.setProperty("--syntax-comment", syntax.comment);
  root.style.setProperty("--syntax-keyword", syntax.keyword);
  root.style.setProperty("--syntax-string", syntax.string);
  root.style.setProperty("--syntax-number", syntax.number);
  root.style.setProperty("--syntax-type", syntax.type);
  root.style.setProperty("--syntax-function", syntax.function);
  root.style.setProperty("--syntax-variable", syntax.variable);
  root.style.setProperty("--syntax-tag", syntax.tag);
  root.style.setProperty("--syntax-attribute", syntax.attribute);
  root.style.setProperty("--syntax-regexp", syntax.regexp);
  root.style.setProperty("--syntax-operator", syntax.operator);
}
