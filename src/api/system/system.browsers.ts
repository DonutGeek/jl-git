import { requestClient } from "@/utils/http";

export interface SystemBrowser {
  id: string;
  name: string;
}

/** 列出本机已探测到的浏览器（不含 auto / custom） */
export async function listBrowsers(): Promise<SystemBrowser[]> {
  return requestClient.post<SystemBrowser[]>("systemListBrowsers");
}
