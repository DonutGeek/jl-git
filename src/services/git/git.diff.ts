import { invokeCommand } from "@/services/invoke";
import type {
  GitCommitFileDiffOptions,
  GitDiffOptions,
  GitDiffResult,
  GitFileMedia,
  GitFileMediaOptions,
  GitStagedDiffResult,
} from "@/types/git";

/** 工作区 / 暂存区单文件 Diff（含 Monaco 两侧文本） */
export async function getDiff(repoPath: string, options: GitDiffOptions): Promise<GitDiffResult> {
  return invokeCommand<GitDiffResult>("git_diff", {
    path: repoPath,
    filePath: options.filePath,
    staged: options.staged ?? false,
    maxBytes: options.maxBytes,
    encoding: options.encoding,
  });
}

/** 单侧文件媒体（图片等）内容，供非文本 Diff/File 预览 */
export async function getFileMedia(
  repoPath: string,
  options: GitFileMediaOptions,
): Promise<GitFileMedia> {
  return invokeCommand<GitFileMedia>("git_file_media", {
    path: repoPath,
    filePath: options.filePath,
    source: options.source,
    maxBytes: options.maxBytes,
  });
}

/** 暂存区限长 Diff：仅供 AI 提交文案生成，不执行任何 Git 写操作。 */
export async function getStagedDiff(
  repoPath: string,
  maxBytes?: number,
): Promise<GitStagedDiffResult> {
  return invokeCommand<GitStagedDiffResult>("git_staged_diff", {
    path: repoPath,
    maxBytes,
  });
}

/** 指定提交的限长 patch：供 AI 改写提交文案。 */
export async function getCommitPatchDiff(
  repoPath: string,
  rev: string,
  maxBytes?: number,
): Promise<GitStagedDiffResult> {
  return invokeCommand<GitStagedDiffResult>("git_commit_patch_diff", {
    path: repoPath,
    rev,
    maxBytes,
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
