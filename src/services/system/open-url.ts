import { invokeCommand } from "@/services/invoke";
import { useAppPrefsStore } from "@/store/useAppPrefsStore";

/** 使用设置中的外部浏览器偏好打开安全的 HTTP(S) 地址。 */
export async function openExternalUrl(value: string): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持打开 HTTP(S) 地址");
  }

  const { externalBrowser, externalBrowserPath } = useAppPrefsStore.getState();
  const preference = externalBrowser || "auto";
  await invokeCommand<{ ok: boolean }>("system_open_url", {
    url: url.toString(),
    preference,
    customPath: preference === "custom" ? externalBrowserPath.trim() || null : null,
  });
}
