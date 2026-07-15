import { invokeCommand } from "@/services/invoke";
import { GitMergeOptions, GitMergeResult } from "@/types/git";

export async function merge(
  repoPath: string,
  ref: string,
  options?: GitMergeOptions,
): Promise<GitMergeResult> {
  return invokeCommand<GitMergeResult>("git_merge", {
    path: repoPath,
    ref,
    mode: options?.mode ?? "default",
    autostash: options?.autostash ?? false,
  });
}
