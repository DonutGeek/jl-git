/** 鲸灵只读代码工具：路径与内容安全策略 */

export const AGENT_CODE_READ_MAX_BYTES = 96 * 1024;
export const AGENT_CODE_SEARCH_MAX_MATCHES = 40;
export const AGENT_CODE_LIST_MAX_ENTRIES = 80;
export const AGENT_CODE_TOOL_MAX_ROUNDS = 6;

const DENY_NAME_PATTERN =
  /(?:^|\/)(?:\.env(?:\..+)?|\.envrc|credentials(?:\.[^/]+)?|\.npmrc|\.netrc|id_rsa|id_ed25519|id_ecdsa|id_dsa|\.pgpass|\.aws\/credentials)(?:$|\.|\/)/i;

const DENY_EXT_PATTERN = /\.(?:pem|key|p12|pfx|jks|keystore|mobileprovision|crt|cer|der|kdbx)$/i;

const SKIP_DIR_PATTERN = /(?:^|\/)(?:node_modules|dist|build|coverage|\.git)(?:\/|$)/i;

const BINARY_EXT_PATTERN =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|bz2|7z|rar|woff2?|ttf|eot|mp4|mov|webm|wasm|exe|dll|so|dylib|bin)$/i;

/** 规范化并校验仓库相对路径；非法则返回 null */
export function normalizeAgentRelativePath(raw: string | undefined | null): string | null {
  if (raw == null) {
    return "";
  }
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (trimmed === "" || trimmed === ".") {
    return "";
  }
  if (trimmed.startsWith("/") || trimmed.includes("\0") || trimmed.split("/").includes("..")) {
    return null;
  }
  return trimmed.replace(/^\.\//, "");
}

export function isDeniedAgentPath(relativePath: string): boolean {
  const path = relativePath.trim().replace(/\\/g, "/");
  if (!path) {
    return false;
  }
  if (SKIP_DIR_PATTERN.test(path) || path === ".git" || path.startsWith(".git/")) {
    return true;
  }
  if (
    DENY_NAME_PATTERN.test(path) ||
    DENY_EXT_PATTERN.test(path) ||
    BINARY_EXT_PATTERN.test(path)
  ) {
    return true;
  }
  return false;
}

export function assertAgentReadablePath(relativePath: string): string {
  const normalized = normalizeAgentRelativePath(relativePath);
  if (normalized == null) {
    throw new Error("路径必须相对仓库根且不得包含 ..");
  }
  if (isDeniedAgentPath(normalized)) {
    throw new Error("该路径受保护，拒绝读取");
  }
  return normalized;
}
