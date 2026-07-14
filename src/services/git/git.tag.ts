import { invokeCommand } from "@/services/invoke";

import {
  GitCreateTagOptions,
  GitTagCreateResult,
  GitTagsResult,
  OkResult,
} from "@/types/git";

export async function listTags(repoPath: string): Promise<GitTagsResult> {
  return invokeCommand<GitTagsResult>("git_tags", { path: repoPath });
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
