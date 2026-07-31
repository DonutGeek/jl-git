import type { GitBranch } from "@/types/git";

/**
 * 本地分支是否已发布到远端。
 * 有 upstream，或存在同名 `origin/<name>` 跟踪分支，即视为已发布。
 */
export function isLocalBranchPublished(
  branch: GitBranch,
  allBranches: readonly GitBranch[],
): boolean {
  if (branch.isRemote) {
    return true;
  }
  if (branch.upstream && branch.upstream.trim().length > 0) {
    return true;
  }
  const remoteTracking = `origin/${branch.name}`;
  return allBranches.some((candidate) => candidate.isRemote && candidate.name === remoteTracking);
}
