import { md5Hex } from "@/utils/md5Hex";

/** 国内可达的 Gravatar 兼容镜像（MD5） */
const GRAVATAR_MIRROR = "https://dn-qiniu-avatar.qbox.me/avatar";

/** Libravatar（SHA-256），作镜像失败时的次选 */
const LIBRAVATAR_CDN = "https://seccdn.libravatar.org/avatar";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** GitHub 用户名形态（用于 `github.com/{name}.png` 兜底） */
function githubUsernameCandidate(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * 按可达性排序的头像候选 URL：
 * GitHub 用户名（与常见客户端一致）→ 七牛 Gravatar（MD5）→ Libravatar（SHA-256）。
 */
export async function avatarUrlsFromEmail(
  email: string,
  size = 64,
  name?: string | null,
): Promise<string[]> {
  const normalized = email.trim().toLowerCase();
  const urls: string[] = [];

  // 作者名常即托管平台用户名；优先于 Gravatar（邮箱可能绑了别的图）
  const githubName = githubUsernameCandidate(name);
  if (githubName) {
    urls.push(`https://github.com/${encodeURIComponent(githubName)}.png?size=${size}`);
  }

  if (normalized) {
    const md5 = md5Hex(normalized);
    const sha256 = await sha256Hex(normalized);
    urls.push(`${GRAVATAR_MIRROR}/${md5}?s=${size}&d=404`);
    urls.push(`${LIBRAVATAR_CDN}/${sha256}?s=${size}&d=404`);
  }

  return urls;
}

/**
 * 依次请求候选 URL，返回可用图片的 object URL（调用方负责 revoke）。
 * 用 fetch+blob 规避部分 WebView 对 `<img src=外链>` 的加载失败。
 */
export async function loadAvatarObjectUrl(
  email: string | null | undefined,
  name?: string | null,
  size = 64,
): Promise<string | null> {
  const urls = await avatarUrlsFromEmail(email ?? "", size, name);
  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) {
        continue;
      }
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        continue;
      }
      return URL.createObjectURL(blob);
    } catch {
      // 试下一个源
    }
  }
  return null;
}

/** 返回首选头像 URL；需要加载时优先用 loadAvatarObjectUrl */
export async function avatarUrlFromEmail(email: string, size = 64): Promise<string> {
  const urls = await avatarUrlsFromEmail(email, size);
  return urls[0] ?? "";
}

/** 从姓名取 1～2 个字符作默认头像文字 */
export function initialsFromName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    return "?";
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}
