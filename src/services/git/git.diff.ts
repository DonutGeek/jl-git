import { invokeCommand } from "@/services/invoke";
import type {
  GitCommitFileDiffOptions,
  GitDiffOptions,
  GitDiffResult,
} from "@/types/git";

/** 工作区 / 暂存区单文件 Diff（含 Monaco 两侧文本） */
export async function getDiff(
  repoPath: string,
  options: GitDiffOptions,
): Promise<GitDiffResult> {
  return invokeCommand<GitDiffResult>("git_diff", {
    path: repoPath,
    filePath: options.filePath,
    staged: options.staged ?? false,
    maxBytes: options.maxBytes,
    encoding: options.encoding,
  });
}

/** 历史提交内单文件相对 parent 的前后对比（含 Monaco 两侧文本） */
export async function getCommitFileDiff(
  repoPath: string,
  options: GitCommitFileDiffOptions,
): Promise<GitDiffResult> {
  return invokeCommand<GitDiffResult>("git_commit_file_diff", {
    path: repoPath,
    filePath: options.filePath,
    commitRev: options.commitRev,
    parentRev: options.parentRev,
    maxBytes: options.maxBytes,
    encoding: options.encoding,
  });
}
