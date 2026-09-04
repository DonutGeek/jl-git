import { requestClient } from "@/utils/http";
import type { GitBranchesResult, GitBranch, OkResult } from "@/types/git";

export interface CreateBranchOptions {
  checkout?: boolean;
  startPoint?: string;
}

export async function listBranches(
  repoPath: string,
  includeRemote?: boolean,
): Promise<GitBranch[]> {
  // Tauri 默认把 Rust snake_case 参数映射为 camelCase
  const result = await requestClient.post<GitBranchesResult>("gitBranches", {
    path: repoPath,
    includeRemote: includeRemote ?? false,
  });

  return result.branches;
}

export async function checkout(repoPath: string, ref: string): Promise<void> {
  await requestClient.post<OkResult>("gitCheckout", { path: repoPath, ref });
}

export async function createBranch(
  repoPath: string,
  name: string,
  options?: CreateBranchOptions,
): Promise<void> {
  await requestClient.post<OkResult>("gitBranchCreate", {
    path: repoPath,
    name,
    checkout: options?.checkout ?? true,
    startPoint: options?.startPoint ?? null,
  });
}

export async function deleteBranch(
  repoPath: string,
  name: string,
  options?: { force?: boolean; deleteRemote?: boolean; remote?: string },
): Promise<void> {
  await requestClient.post<OkResult>("gitBranchDelete", {
    path: repoPath,
    name,
    force: options?.force ?? false,
    deleteRemote: options?.deleteRemote ?? false,
    remote: options?.remote ?? "origin",
  });
}

export async function renameBranch(
  repoPath: string,
  oldName: string,
  newName: string,
): Promise<void> {
  await requestClient.post<OkResult>("gitBranchRename", {
    path: repoPath,
    oldName,
    newName,
  });
}
