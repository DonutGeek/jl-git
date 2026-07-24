import { invokeCommand } from "@/services/invoke";

import {
  GitCreateTagOptions,
  GitRemoteTag,
  GitRemoteTagsResult,
  GitTagCreateResult,
  GitTagsResult,
  OkResult,
} from "@/types/git";

export async function listTags(repoPath: string): Promise<GitTagsResult> {
  return invokeCommand<GitTagsResult>("git_tags", { path: repoPath });
}

/** 查询远端标签列表（联网，ls-remote） */
export async function listRemoteTags(
  repoPath: string,
  remote: string,
): Promise<GitRemoteTag[]> {
  const result = await invokeCommand<GitRemoteTagsResult>("git_tags_remote", {
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
  await invokeCommand<OkResult>("git_tag_fetch", {
    path: repoPath,
    name,
    remote,
  });
}

export async function createTag(
  repoPath: string,
  options: GitCreateTagOptions,
): Promise<GitTagCreateResult> {
  return invokeCommand<GitTagCreateResult>("git_tag_create", {
    path: repoPath,
    name: options.name,
    message: options.message,
    ref: options.ref,
    push: options.push,
    remote: options.remote,
  });
}

export async function deleteTag(repoPath: string, name: string): Promise<void> {
  await invokeCommand<OkResult>("git_tag_delete", { path: repoPath, name });
}

/** 推送单个标签到指定远端 */
export async function pushTag(
  repoPath: string,
  name: string,
  remote: string,
): Promise<void> {
  await invokeCommand<OkResult>("git_tag_push", {
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
  await invokeCommand<OkResult>("git_tag_delete_remote", {
    path: repoPath,
    name,
    remote,
  });
}
