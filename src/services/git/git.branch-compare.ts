import { invokeCommand } from "@/services/invoke";
import type {
  GitBranchCompareOptions,
  GitBranchCompareResult,
  GitBranchFileDiffOptions,
  GitDiffResult,
} from "@/types/git";

/** 读取两个 ref 间的改动文件；不改变仓库状态。 */
export async function getBranchCompare(
  repoPath: string,
  options: GitBranchCompareOptions,
): Promise<GitBranchCompareResult> {
  return invokeCommand<GitBranchCompareResult>("git_branch_compare", {
    path: repoPath,
    base: options.base,
    target: options.target,
  });
}

/** 读取两个 ref 中指定文件的 Diff；不改变仓库状态。 */
export async function getBranchFileDiff(
  repoPath: string,
  options: GitBranchFileDiffOptions,
): Promise<GitDiffResult> {
  return invokeCommand<GitDiffResult>("git_branch_file_diff", {
    path: repoPath,
    base: options.base,
    target: options.target,
    filePath: options.filePath,
    maxBytes: options.maxBytes,
    encoding: options.encoding,
  });
}
