import { invokeCommand } from "@/services/invoke";

import type { ConflictSide, GitRepoState, GitWorktreeFileResult, OkResult } from "@/types/git";

/** 读取合并/变基进行中状态与冲突路径 */
export async function getRepoState(repoPath: string): Promise<GitRepoState> {
  return invokeCommand<GitRepoState>("git_repo_state", { path: repoPath });
}

/** 整文件采用 ours / theirs 并标记已解决 */
export async function conflictTake(
  repoPath: string,
  filePath: string,
  side: ConflictSide,
): Promise<OkResult> {
  return invokeCommand<OkResult>("git_conflict_take", {
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
  return invokeCommand<GitWorktreeFileResult>("git_read_worktree_file", {
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
  return invokeCommand<OkResult>("git_write_worktree_file", {
    path: repoPath,
    filePath,
    content,
    stage: options?.stage,
    encoding: options?.encoding,
  });
}

/** 标记冲突已解决（git add） */
export async function conflictMarkResolved(repoPath: string, filePath: string): Promise<OkResult> {
  return invokeCommand<OkResult>("git_conflict_mark_resolved", {
    path: repoPath,
    filePath,
  });
}
