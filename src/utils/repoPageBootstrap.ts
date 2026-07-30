export type RepoBootstrapMode = "ready" | "restore-cache" | "load";

interface RepoBootstrapInput {
  targetPath: string;
  activeStorePath: string | null;
  hasCachedSession: boolean;
}

export function resolveRepoBootstrapMode({
  targetPath,
  activeStorePath,
  hasCachedSession,
}: RepoBootstrapInput): RepoBootstrapMode {
  if (activeStorePath === targetPath && hasCachedSession) {
    return "ready";
  }
  return hasCachedSession ? "restore-cache" : "load";
}

interface RepoLoadingShellInput {
  targetPath: string;
  activeStorePath: string | null;
  readyRepoPath: string | null;
}

export function shouldShowRepoLoadingShell({
  targetPath,
  activeStorePath,
  readyRepoPath,
}: RepoLoadingShellInput): boolean {
  return activeStorePath !== targetPath || readyRepoPath !== targetPath;
}
