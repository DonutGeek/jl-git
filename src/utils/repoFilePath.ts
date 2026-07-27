import { detectAppOs, type AppOs } from "@/services/window/windowChrome";

/** 按仓库路径风格或 OS 选择分隔符（Windows 仓库多为 `\`） */
function pathSeparator(repoPath: string, os?: AppOs): "\\" | "/" {
  if (repoPath.includes("\\")) {
    return "\\";
  }
  if (repoPath.includes("/")) {
    return "/";
  }
  const resolved = os ?? detectAppOs();
  return resolved === "windows" ? "\\" : "/";
}

/**
 * 将仓库相对路径拼为绝对路径。
 * 分隔符优先跟随 `repoPath` 风格，避免仅靠 UA 误判三端。
 */
export function toAbsoluteRepoFilePath(repoPath: string, relativePath: string, os?: AppOs): string {
  const base = repoPath.replace(/[/\\]+$/, "");
  const rel = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const sep = pathSeparator(base, os);
  const normalizedRel = sep === "\\" ? rel.split("/").join("\\") : rel;
  return `${base}${sep}${normalizedRel}`;
}
