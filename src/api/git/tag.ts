import { requestClient } from "@/utils/http";

import type {
  GitCreateTagOptions,
  GitRemoteTag,
  GitRemoteTagsResult,
  GitTagCreateResult,
  GitTagsResult,
  OkResult,
} from "@/types/git";

export async function listTags(repoPath: string): Promise<GitTagsResult> {
  return requestClient.post<GitTagsResult>("gitTags", { path: repoPath });
}

/** 查询远端标签列表（联网，ls-remote） */
export async function listRemoteTags(repoPath: string, remote: string): Promise<GitRemoteTag[]> {
  const result = await requestClient.post<GitRemoteTagsResult>("gitTagsRemote", {
    path: repoPath,
    remote,
  });
  return result.tags;
}

/** 拉取指定远端标签到本地 */
export async function fetchRemoteTag(
  repoPath: string,
  name: string,
  remote: string,
): Promise<void> {
  await requestClient.post<OkResult>("gitTagFetch", {
    path: repoPath,
    name,
    remote,
  });
}

export async function createTag(
  repoPath: string,
  options: GitCreateTagOptions,
): Promise<GitTagCreateResult> {
  return requestClient.post<GitTagCreateResult>("gitTagCreate", {
    path: repoPath,
    name: options.name,
    message: options.message,
    ref: options.ref,
    push: options.push,
    remote: options.remote,
  });
}

export async function deleteTag(repoPath: string, name: string): Promise<void> {
  await requestClient.post<OkResult>("gitTagDelete", { path: repoPath, name });
}

/** 推送单个标签到指定远端 */
export async function pushTag(repoPath: string, name: string, remote: string): Promise<void> {
  await requestClient.post<OkResult>("gitTagPush", {
    path: repoPath,
    name,
    remote,
  });
}

/** 从远端删除标签 */
export async function deleteRemoteTag(
  repoPath: string,
  name: string,
  remote: string,
): Promise<void> {
  await requestClient.post<OkResult>("gitTagDeleteRemote", {
    path: repoPath,
    name,
    remote,
  });
}
