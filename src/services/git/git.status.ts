import { invokeCommand } from "@/services/invoke";
import type { GitStatusResult } from "@/types/git";

export async function getStatus(repoPath: string): Promise<GitStatusResult> {
  return invokeCommand<GitStatusResult>("git_status", { path: repoPath });
}
