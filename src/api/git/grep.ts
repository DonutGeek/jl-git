import { requestClient } from "@/utils/http";

import type { GitGrepResult } from "@/types/git";

/** 仓库内固定字符串代码搜索（只读） */
export async function searchCode(
  repoPath: string,
  pattern: string,
  options?: { pathspec?: string; maxMatches?: number },
): Promise<GitGrepResult> {
  return requestClient.post<GitGrepResult>("gitGrep", {
    path: repoPath,
    pattern,
    pathspec: options?.pathspec,
    maxMatches: options?.maxMatches,
  });
}
