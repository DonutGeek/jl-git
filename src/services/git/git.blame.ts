import { invokeCommand } from "@/services/invoke";

import type { GitBlameResult } from "@/types/git";

/** 文件行追溯（git blame --line-porcelain） */
export async function getBlame(
  repoPath: string,
  filePath: string,
  rev?: string,
): Promise<GitBlameResult> {
  return invokeCommand<GitBlameResult>("git_blame", {
    path: repoPath,
    filePath,
    rev,
  });
}
