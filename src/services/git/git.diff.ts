import { invokeCommand } from "@/services/invoke";
import type { GitDiffOptions, GitDiffResult } from "@/types/git";

/** 工作区 / 暂存区单文件 Diff（含 Monaco 两侧文本） */
export async function getDiff(
  repoPath: string,
  options: GitDiffOptions,
): Promise<GitDiffResult> {
  return invokeCommand<GitDiffResult>("git_diff", {
    path: repoPath,
    filePath: options.filePath,
    staged: options.staged ?? false,
    maxBytes: options.maxBytes,
    encoding: options.encoding,
  });
}
