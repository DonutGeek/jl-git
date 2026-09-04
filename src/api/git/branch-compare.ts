import { requestClient } from "@/utils/http";
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
  return requestClient.post<GitBranchCompareResult>("gitBranchCompare", {
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
  return requestClient.post<GitDiffResult>("gitBranchFileDiff", {
    path: repoPath,
    base: options.base,
    target: options.target,
    filePath: options.filePath,
    maxBytes: options.maxBytes,
    encoding: options.encoding,
  });
}
