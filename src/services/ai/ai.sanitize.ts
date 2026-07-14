/** 掩码常见凭据形式，避免把仓库上下文中的敏感值发送给模型服务。 */
export function redactSecrets(value: string): string {
  return value
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s'"`]+/gi, "$1=[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]")
    .replace(
      /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
      "[REDACTED PRIVATE KEY]",
    );
}
