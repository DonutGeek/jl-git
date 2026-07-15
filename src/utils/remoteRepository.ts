export type RemoteProvider = "github" | "gitlab" | "gitee" | "bitbucket" | "unknown";

export interface RemoteRepository {
  provider: RemoteProvider;
  repositoryName: string;
  url: string;
}

const PROVIDERS: Record<string, Exclude<RemoteProvider, "unknown">> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "gitee.com": "gitee",
  "bitbucket.org": "bitbucket",
};

function toRemoteUrl(value: string): URL | null {
  const sshMatch = value.match(/^[^@]+@([^:]+):(.+)$/);
  const normalized = sshMatch
    ? `ssh://${sshMatch[1]}/${sshMatch[2]}`
    : value;

  try {
    const parsed = new URL(normalized);
    return ["http:", "https:", "ssh:"].includes(parsed.protocol)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** 将 Git 远端地址转换为用于界面展示的托管平台与仓库名。 */
export function parseRemoteRepository(url: string): RemoteRepository | null {
  const normalizedUrl = url.trim();
  const parsed = toRemoteUrl(normalizedUrl);
  if (!parsed) {
    return null;
  }

  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  const repositoryName = pathSegments[pathSegments.length - 1];
  if (!repositoryName) {
    return null;
  }

  return {
    provider: PROVIDERS[parsed.hostname.toLowerCase()] ?? "unknown",
    repositoryName,
    url: normalizedUrl,
  };
}
