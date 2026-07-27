import { invokeCommand } from "@/services/invoke";
import { GitLogOptions, GitLogOrder, GitLogResult } from "@/types/git";
import {
  historyAdvancedToLogOptions,
  type HistoryAdvancedFilters,
} from "@/utils/historyAdvancedFilters";

/**
 * 历史列表默认查询：无选中 ref 时用 `--all`（对齐「所有分支」），
 * 有 logRef（分支/标签）时只看该引用；可叠加高级筛选。
 */
export function buildHistoryLogOptions(options: {
  skip?: number;
  limit?: number;
  logRef: string | null;
  order?: GitLogOrder;
  advanced?: HistoryAdvancedFilters | null;
}): GitLogOptions {
  const { skip, limit, logRef, order = "default", advanced } = options;
  const orderOpt = order === "default" ? undefined : order;
  const advancedOpts = historyAdvancedToLogOptions(advanced);
  if (logRef) {
    return { skip, limit, ref: logRef, order: orderOpt, ...advancedOpts };
  }
  return { skip, limit, all: true, order: orderOpt, ...advancedOpts };
}

export async function getLog(
  repoPath: string,
  options?: GitLogOptions,
): Promise<GitLogResult> {
  return invokeCommand<GitLogResult>("git_log", {
    path: repoPath,
    skip: options?.skip,
    limit: options?.limit,
    ref: options?.ref,
    all: options?.all,
    order: options?.order,
    filePath: options?.path,
    authors: options?.authors,
    reverse: options?.reverse,
    grep: options?.grep,
    since: options?.since,
    until: options?.until,
    noMerges: options?.noMerges,
  });
}
