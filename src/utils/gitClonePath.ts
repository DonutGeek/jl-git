/** 从 clone URL 推断默认仓库目录名（不含 .git） */
export function repoNameFromCloneUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  const withoutGit = trimmed.replace(/\.git$/i, "");
  const segments = withoutGit.split(/[/\\:]/).filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  const safe = last.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
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
