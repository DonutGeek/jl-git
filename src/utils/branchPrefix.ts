/** 鲸灵Git 默认分支前缀（系列多工具时按产品区分命名空间） */
export const DEFAULT_BRANCH_PREFIX = "jlgit/";

/**
 * 规范化分支前缀：trim；空串表示无前缀；非空且无尾 `/` 时补上。
 */
export function normalizeBranchPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/**
 * 前缀输入是否可接受：允许空；禁止空白、空字符、反斜杠。
 */
export function isBranchPrefixInputValid(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return true;
  }
  if (/\s/.test(trimmed) || trimmed.includes("\0") || trimmed.includes("\\")) {
    return false;
  }
  return true;
}
