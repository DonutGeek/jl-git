import { openUrl } from "@tauri-apps/plugin-opener";

/** 使用系统默认浏览器打开安全的 HTTP(S) 地址。 */
export async function openExternalUrl(value: string): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持打开 HTTP(S) 地址");
  }

  await openUrl(url);
}
