/** 返回跨平台路径的最后一级名称。 */
export function getPathBasename(path: string): string {
  const parts = path
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .filter(Boolean);
  return parts[parts.length - 1] ?? "";
}
