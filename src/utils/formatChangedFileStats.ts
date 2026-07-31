/** 改动文件统计摘要（总数始终展示；增减改仅非 0 时展示） */
export interface ChangedFileStatsSummary {
  total: number;
  added: number;
  modified: number;
  deleted: number;
}

/** 拆成文案片段，便于 UI 用 gap 排布 */
export function getChangedFileStatsParts(
  t: (key: string, options?: Record<string, number>) => string,
  summary: ChangedFileStatsSummary,
): string[] {
  const parts = [t("repo.commitStatTotal", { count: summary.total })];
  if (summary.added > 0) {
    parts.push(t("repo.commitStatAdded", { count: summary.added }));
  }
  if (summary.modified > 0) {
    parts.push(t("repo.commitStatModified", { count: summary.modified }));
  }
  if (summary.deleted > 0) {
    parts.push(t("repo.commitStatDeleted", { count: summary.deleted }));
  }
  return parts;
}

/**
 * 文件统计文案：省略为 0 的项，项间空格分隔。
 */
export function formatChangedFileStats(
  t: (key: string, options?: Record<string, number>) => string,
  summary: ChangedFileStatsSummary,
): string {
  return getChangedFileStatsParts(t, summary).join(" ");
}
