/**
 * 在路径 / 分支名等标识符的分隔符后插入零宽空格，供 CSS 优先在边界换行，
 * 避免 `break-all` 把英文单词拆到字母中间（如 activity → activit / y）。
 *
 * 零宽空格不占视觉宽度；复制时应仍用原始字符串（勿直接从带 ZWSP 的 DOM 取文案）。
 */
const SOFT_WRAP_AFTER = /([/\\&._-])/g;

export function withSoftWrapOpportunities(value: string): string {
  if (!value) {
    return value;
  }
  return value.replace(SOFT_WRAP_AFTER, "$1\u200B");
}
