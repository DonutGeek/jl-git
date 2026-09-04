import { requestClient } from "@/utils/http";
import type { GitStashListResult, OkResult, RestoreLintStagedResult } from "@/types/git";

export async function listStash(repoPath: string): Promise<GitStashListResult> {
  return requestClient.post<GitStashListResult>("gitStashList", { path: repoPath });
}

export async function stashApply(repoPath: string, index?: number): Promise<void> {
  await requestClient.post<OkResult>("gitStashApply", {
    path: repoPath,
    index: index ?? null,
  });
}

/** 提交钩子闪退后：恢复 lint-staged automatic backup */
export async function restoreLintStagedBackup(repoPath: string): Promise<RestoreLintStagedResult> {
  return requestClient.post<RestoreLintStagedResult>("gitRestoreLintStagedBackup", {
    path: repoPath,
  });
}
