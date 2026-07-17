import type { GitRepoState } from "@/types/git";

/** 有未解决冲突时，禁止切换分支等写操作 */
export function hasUnresolvedConflicts(repoState: GitRepoState | null | undefined): boolean {
  return (repoState?.conflictCount ?? 0) > 0;
}

/** 合并/变基/cherry-pick 进行中（含冲突已解决但未提交） */
export function isRepoOperationInProgress(
  repoState: GitRepoState | null | undefined,
): boolean {
  return Boolean(repoState?.merging);
}

/**
 * 切换分支、拉取、再次合并等写操作是否应拦截。
 * 有冲突或处于 merge/rebase/cherry-pick 过程中均拦截。
 */
export function isWriteOpBlocked(repoState: GitRepoState | null | undefined): boolean {
  return hasUnresolvedConflicts(repoState) || isRepoOperationInProgress(repoState);
}
