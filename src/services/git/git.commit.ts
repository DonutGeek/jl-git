import { invokeCommand } from "@/services/invoke";
import { GitCommitOptions, GitCommitResult, OkResult } from "@/types/git";

export async function stage(repoPath: string, paths: string[]): Promise<void> {
  await invokeCommand<OkResult>("git_stage", { path: repoPath, paths });
}

export async function unstage(repoPath: string, paths: string[]): Promise<void> {
  await invokeCommand<OkResult>("git_unstage", { path: repoPath, paths });
}

export async function stageAll(repoPath: string): Promise<void> {
  await invokeCommand<OkResult>("git_stage_all", { path: repoPath });
}

export async function unstageAll(repoPath: string): Promise<void> {
  await invokeCommand<OkResult>("git_unstage_all", { path: repoPath });
}

export async function commit(
  repoPath: string,
  message: string,
  options: GitCommitOptions,
): Promise<string> {
  const result = await invokeCommand<GitCommitResult>("git_commit", {
    path: repoPath,
    message,
    paths: options.paths,
    removePaths: options.removePaths ?? [],
    amend: options.amend,
  });

  return result.commitId;
}
