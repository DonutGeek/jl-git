import { requestClient } from "@/utils/http";

import type { GitStatusResult } from "@/types/git";

/** 读取工作区 status（含暂存 / 未暂存） */
export async function getStatus(repoPath: string): Promise<GitStatusResult> {
  return requestClient.post<GitStatusResult>("gitStatus", { path: repoPath });
}
