import { requestClient } from "@/utils/http";
import type { GitMergeOptions, GitMergeResult } from "@/types/git";

export async function merge(
  repoPath: string,
  ref: string,
  options?: GitMergeOptions,
): Promise<GitMergeResult> {
  return requestClient.post<GitMergeResult>("gitMerge", {
    path: repoPath,
    ref,
    mode: options?.mode ?? "default",
    autostash: options?.autostash ?? false,
  });
}
