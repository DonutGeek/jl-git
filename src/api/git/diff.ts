import { requestClient } from "@/utils/http";
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
  return requestClient.post<GitDiffResult>("gitDiff", {
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
  return requestClient.post<GitFileMedia>("gitFileMedia", {
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
  return requestClient.post<GitStagedDiffResult>("gitStagedDiff", {
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
  return requestClient.post<GitStagedDiffResult>("gitCommitPatchDiff", {
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
  return requestClient.post<GitDiffResult>("gitCommitFileDiff", {
    path: repoPath,
    filePath: options.filePath,
    commitRev: options.commitRev,
    parentRev: options.parentRev,
    maxBytes: options.maxBytes,
    encoding: options.encoding,
  });
}
