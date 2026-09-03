import type { GitBranch } from "@/types/git";

/**
 * 工具栏默认比较：源=当前分支；目标优先 upstream，其次 origin/<name>，否则自身。
 */
export function resolveDefaultCompareTarget(
  branches: readonly GitBranch[],
  currentBranch: string,
): string {
  const local = branches.find((branch) => !branch.isRemote && branch.name === currentBranch);
  const upstream = local?.upstream?.trim() ?? "";
  if (upstream) {
    return upstream;
  }
  const originTwin = `origin/${currentBranch}`;
  if (branches.some((branch) => branch.isRemote && branch.name === originTwin)) {
    return originTwin;
  }
  return currentBranch;
}
