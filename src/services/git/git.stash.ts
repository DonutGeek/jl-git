import { invokeCommand } from "@/services/invoke";
import type { GitStashListResult, OkResult, RestoreLintStagedResult } from "@/types/git";

export async function listStash(repoPath: string): Promise<GitStashListResult> {
  return invokeCommand<GitStashListResult>("git_stash_list", { path: repoPath });
}

export async function stashApply(repoPath: string, index?: number): Promise<void> {
  await invokeCommand<OkResult>("git_stash_apply", {
    path: repoPath,
    index: index ?? null,
  });
}

/** 提交钩子闪退后：恢复 lint-staged automatic backup */
export async function restoreLintStagedBackup(repoPath: string): Promise<RestoreLintStagedResult> {
  return invokeCommand<RestoreLintStagedResult>("git_restore_lint_staged_backup", {
    path: repoPath,
  });
}
