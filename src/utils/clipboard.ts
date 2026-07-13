import { writeText } from "@tauri-apps/plugin-clipboard-manager";

/** 写入系统剪贴板（经 Tauri clipboard 插件） */
export async function copyToClipboard(text: string): Promise<void> {
  await writeText(text);
}
