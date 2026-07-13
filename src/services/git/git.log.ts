import { invokeCommand } from "@/services/invoke";
import { GitLogOptions, GitLogResult } from "@/types/git";

export async function getLog(
  repoPath: string,
  options?: GitLogOptions,
): Promise<GitLogResult> {
  return invokeCommand<GitLogResult>("git_log", {
    path: repoPath,
    skip: options?.skip,
    limit: options?.limit,
    ref: options?.ref,
  });
}
