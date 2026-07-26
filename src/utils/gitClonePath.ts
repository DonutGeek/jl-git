/** 从 clone URL 推断默认仓库目录名（不含 .git） */
export function repoNameFromCloneUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  const withoutGit = trimmed.replace(/\.git$/i, "");
  const segments = withoutGit.split(/[/\\:]/).filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  const safe = last.replace(/[^\w.\-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "repository";
}

/** 拼接父目录与仓库名（保留原路径分隔风格） */
export function joinCloneDestPath(parentDir: string, repoName: string): string {
  const parent = parentDir.trim().replace(/[\\/]+$/, "");
  const name = repoName.trim();
  if (!parent) {
    return name;
  }
  if (!name) {
    return parent;
  }
  const sep = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  return `${parent}${sep}${name}`;
}

/**
 * URL 变更时更新存放路径：
 * - 路径为空：用「父目录候选 + 仓库名」
 * - 路径以旧仓库名结尾：替换为新仓库名
 * - 否则保持用户手改路径
 */
export function suggestCloneDestPath(options: {
  url: string;
  currentPath: string;
  previousRepoName: string;
  parentHint?: string;
}): { path: string; repoName: string } {
  const repoName = repoNameFromCloneUrl(options.url);
  const current = options.currentPath.trim();
  if (!repoName) {
    return { path: current, repoName: "" };
  }

  if (!current) {
    const parent = options.parentHint?.trim() ?? "";
    return {
      path: parent ? joinCloneDestPath(parent, repoName) : repoName,
      repoName,
    };
  }

  const normalized = current.replace(/[\\/]+$/, "");
  const prev = options.previousRepoName.trim();
  if (prev) {
    const suffixSlash = `/${prev}`;
    const suffixBack = `\\${prev}`;
    if (normalized.endsWith(suffixSlash) || normalized.endsWith(suffixBack)) {
      const parent = normalized.slice(0, normalized.length - prev.length - 1);
      return { path: joinCloneDestPath(parent, repoName), repoName };
    }
    if (normalized === prev) {
      return { path: repoName, repoName };
    }
  }

  return { path: current, repoName };
}
