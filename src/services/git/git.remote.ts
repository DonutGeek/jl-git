import { invokeCommand } from "@/services/invoke";
import { openExternalUrl } from "@/services/system/open-url";

import type {
  GitFetchResult,
  GitPullResult,
  GitPushResult,
  GitRemote,
  GitRemotesResult,
} from "@/types/git";
import { toBrowsableRemoteUrl } from "@/utils/remoteRepository";

/** 列出远端及其 URL */
export async function listRemotes(repoPath: string): Promise<GitRemote[]> {
  const result = await invokeCommand<GitRemotesResult>("git_remotes", {
    path: repoPath,
  });
  return result.remotes;
}

/** 优先 origin 的 fetch URL，否则第一个远端 */
export function pickPrimaryRemoteUrl(remotes: GitRemote[]): string | null {
  const preferred = remotes.find((remote) => remote.name === "origin") ?? remotes[0];
  if (!preferred) {
    return null;
  }
  const url = preferred.fetchUrl.trim() || preferred.pushUrl.trim();
  return url.length > 0 ? url : null;
}

export type OpenPrimaryRemoteResult = "opened" | "empty" | "unsupported";

/** 用默认浏览器打开主远端的网页地址（SSH 会转为 https） */
export async function openPrimaryRemoteInBrowser(
  repoPath: string,
): Promise<OpenPrimaryRemoteResult> {
  const remoteUrl = pickPrimaryRemoteUrl(await listRemotes(repoPath));
  if (!remoteUrl) {
    return "empty";
  }
  const browseUrl = toBrowsableRemoteUrl(remoteUrl);
  if (!browseUrl) {
    return "unsupported";
  }
  await openExternalUrl(browseUrl);
  return "opened";
}

/** 检查更新：fetch 远端跟踪引用（默认 origin） */
export async function fetch(repoPath: string, remote?: string): Promise<GitFetchResult> {
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
export async function pull(repoPath: string, options?: GitPullOptions): Promise<GitPullResult> {
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
export async function push(repoPath: string, options?: GitPushOptions): Promise<GitPushResult> {
  return invokeCommand<GitPushResult>("git_push", {
    path: repoPath,
    remote: options?.remote,
    branch: options?.branch,
    setUpstream: options?.setUpstream,
    force: options?.force,
  });
}
