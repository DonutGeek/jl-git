/** 根据邮箱生成头像 URL；无公开头像时服务端返回 404，由 UI 回退默认图 */
export async function avatarUrlFromEmail(
  email: string,
  size = 64,
): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  // Libravatar 兼容 Gravatar，支持 SHA-256
  return `https://seccdn.libravatar.org/avatar/${hash}?s=${size}&d=404`;
}

/** 从姓名取 1～2 个字符作默认头像文字 */
export function initialsFromName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    return "?";
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}
