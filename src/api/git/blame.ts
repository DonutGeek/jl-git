import { requestClient } from "@/utils/http";

import type { GitBlameResult } from "@/types/git";

/** 文件行追溯（git blame --line-porcelain） */
export async function getBlame(
  repoPath: string,
  filePath: string,
  rev?: string,
): Promise<GitBlameResult> {
  return requestClient.post<GitBlameResult>("gitBlame", {
    path: repoPath,
    filePath,
    rev,
  });
}
