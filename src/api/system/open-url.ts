import { requestClient } from "@/utils/http";
import { useAppPrefsStoreWithOut } from "@/store/modules/app";

/** 使用设置中的外部浏览器偏好打开安全的 HTTP(S) 地址。 */
export async function openExternalUrl(value: string): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持打开 HTTP(S) 地址");
  }

  const { externalBrowser, externalBrowserPath } = useAppPrefsStoreWithOut();
  const preference = externalBrowser || "auto";
  await requestClient.post<{ ok: boolean }>("systemOpenUrl", {
    url: url.toString(),
    preference,
    customPath: preference === "custom" ? externalBrowserPath.trim() || null : null,
  });
}
