import { invokeCommand } from "@/services/invoke";

import type { GitGrepResult } from "@/types/git";

/** 仓库内固定字符串代码搜索（只读） */
export async function searchCode(
  repoPath: string,
  pattern: string,
  options?: { pathspec?: string; maxMatches?: number },
): Promise<GitGrepResult> {
  return invokeCommand<GitGrepResult>("git_grep", {
    path: repoPath,
    pattern,
    pathspec: options?.pathspec,
    maxMatches: options?.maxMatches,
  });
}
