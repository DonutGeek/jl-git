import { requestClient } from "@/utils/http";

import type { ConflictSide, GitRepoState, GitWorktreeFileResult, OkResult } from "@/types/git";

/** 读取合并/变基进行中状态与冲突路径 */
export async function getRepoState(repoPath: string): Promise<GitRepoState> {
  return requestClient.post<GitRepoState>("gitRepoState", { path: repoPath });
}

/** 终止当前合并、变基或 cherry-pick。 */
export async function abortOperation(repoPath: string): Promise<OkResult> {
  return requestClient.post<OkResult>("gitAbortOperation", { path: repoPath });
}

/** 整文件采用 ours / theirs 并标记已解决 */
export async function conflictTake(
  repoPath: string,
  filePath: string,
  side: ConflictSide,
): Promise<OkResult> {
  return requestClient.post<OkResult>("gitConflictTake", {
    path: repoPath,
    filePath,
    side,
  });
}

/** 读取工作区文件（含冲突标记） */
export async function readWorktreeFile(
  repoPath: string,
  filePath: string,
  options?: { encoding?: string; maxBytes?: number },
): Promise<GitWorktreeFileResult> {
  return requestClient.post<GitWorktreeFileResult>("gitReadWorktreeFile", {
    path: repoPath,
    filePath,
    encoding: options?.encoding,
    maxBytes: options?.maxBytes,
  });
}

/** 写回工作区；stage 时同时 git add */
export async function writeWorktreeFile(
  repoPath: string,
  filePath: string,
  content: string,
  options?: { stage?: boolean; encoding?: string },
): Promise<OkResult> {
  return requestClient.post<OkResult>("gitWriteWorktreeFile", {
    path: repoPath,
    filePath,
    content,
    stage: options?.stage,
    encoding: options?.encoding,
  });
}

/** 标记冲突已解决（git add） */
export async function conflictMarkResolved(repoPath: string, filePath: string): Promise<OkResult> {
  return requestClient.post<OkResult>("gitConflictMarkResolved", {
    path: repoPath,
    filePath,
  });
}
