import { invokeCommand } from "@/services/invoke";

import { GitFetchResult, GitPullResult, GitPushResult } from "@/types/git";

/** 检查更新：fetch 远端跟踪引用（默认 origin） */
export async function fetch(
  repoPath: string,
  remote?: string,
): Promise<GitFetchResult> {
  return invokeCommand<GitFetchResult>("git_fetch", {
    path: repoPath,
    remote,
  });
}

export interface GitPullOptions {
  remote?: string;
  branch?: string;
  rebase?: boolean;
}

/** 更新：pull 远端到本地（默认 origin + 指定分支，或跟随 upstream） */
export async function pull(
  repoPath: string,
  options?: GitPullOptions,
): Promise<GitPullResult> {
  return invokeCommand<GitPullResult>("git_pull", {
    path: repoPath,
    remote: options?.remote,
    branch: options?.branch,
    rebase: options?.rebase,
  });
}

export interface GitPushOptions {
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
  force?: boolean;
}

/** 推送到远端（默认跟随 upstream） */
export async function push(
  repoPath: string,
  options?: GitPushOptions,
): Promise<GitPushResult> {
  return invokeCommand<GitPushResult>("git_push", {
    path: repoPath,
    remote: options?.remote,
    branch: options?.branch,
    setUpstream: options?.setUpstream,
    force: options?.force,
  });
}
