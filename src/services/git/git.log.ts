import { invokeCommand } from "@/services/invoke";
import { GitLogOptions, GitLogOrder, GitLogResult } from "@/types/git";

/**
 * 历史列表默认查询：无选中 ref 时用 `--all`（对齐「所有分支」），
 * 有 logRef（分支/标签）时只看该引用。
 */
export function buildHistoryLogOptions(options: {
  skip?: number;
  limit?: number;
  logRef: string | null;
  order?: GitLogOrder;
}): GitLogOptions {
  const { skip, limit, logRef, order = "default" } = options;
  const orderOpt = order === "default" ? undefined : order;
  if (logRef) {
    return { skip, limit, ref: logRef, order: orderOpt };
  }
  return { skip, limit, all: true, order: orderOpt };
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
  });
}
