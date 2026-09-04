import { requestClient } from "@/utils/http";
import type { GitCommitOptions, GitCommitResult, OkResult } from "@/types/git";

export async function stage(repoPath: string, paths: string[]): Promise<void> {
  await requestClient.post<OkResult>("gitStage", { path: repoPath, paths });
}

export async function unstage(repoPath: string, paths: string[]): Promise<void> {
  await requestClient.post<OkResult>("gitUnstage", { path: repoPath, paths });
}

export async function stageAll(repoPath: string): Promise<void> {
  await requestClient.post<OkResult>("gitStageAll", { path: repoPath });
}

export async function unstageAll(repoPath: string): Promise<void> {
  await requestClient.post<OkResult>("gitUnstageAll", { path: repoPath });
}

/** 放弃指定路径的更改（含暂存区与工作区；调用前 UI 须确认） */
export async function discard(repoPath: string, paths: string[]): Promise<void> {
  await requestClient.post<OkResult>("gitDiscard", { path: repoPath, paths });
}

export async function commit(
  repoPath: string,
  message: string,
  options: GitCommitOptions,
): Promise<string> {
  const result = await requestClient.post<GitCommitResult>("gitCommit", {
    path: repoPath,
    message,
    paths: options.paths,
    removePaths: options.removePaths ?? [],
    amend: options.amend,
  });

  return result.commitId;
}

/** 撤销提交：reset --mixed 到 target（省略则 HEAD~1） */
export async function undoCommit(
  repoPath: string,
  target?: string,
): Promise<{ target: string; elapsedMs: number }> {
  const result = await requestClient.post<{ ok: boolean; target: string; elapsedMs: number }>(
    "gitUndoCommit",
    {
      path: repoPath,
      target: target ?? null,
    },
  );
  return { target: result.target, elapsedMs: result.elapsedMs };
}

/** 仅修改 HEAD 提交信息（rev 须解析为当前 HEAD） */
export async function amendMessage(
  repoPath: string,
  rev: string,
  message: string,
): Promise<string> {
  const result = await requestClient.post<GitCommitResult>("gitAmendMessage", {
    path: repoPath,
    rev,
    message,
  });
  return result.commitId;
}
