import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";

import { createAppWindowChromeOptions } from "@/services/window/windowChrome";

const PROJECT_MANAGE_WINDOW_LABEL = "project-manage";
const PROJECT_MANAGE_WINDOW_SIZE = new LogicalSize(1180, 760);

/** 创建或聚焦「仓库管理」浮动子窗口（单例）。 */
export async function openProjectManageWindow(): Promise<void> {
  // 先让出一帧，避免点击反馈被创建 Webview 同步拖住
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

  const existing = await WebviewWindow.getByLabel(PROJECT_MANAGE_WINDOW_LABEL);
  if (existing) {
    // 已存在则只聚焦，不强制改尺寸（避免缺权限报错，并保留用户拖拽后的大小）
    await existing.show();
    await existing.setFocus();
    return;
  }

  const windowRef = new WebviewWindow(PROJECT_MANAGE_WINDOW_LABEL, {
    url: "/project-manage",
    title: "仓库管理",
    width: PROJECT_MANAGE_WINDOW_SIZE.width,
    height: PROJECT_MANAGE_WINDOW_SIZE.height,
    minWidth: 900,
    minHeight: 600,
    ...createAppWindowChromeOptions(),
  });
  await new Promise<void>((resolve, reject) => {
    void windowRef.once("tauri://created", () => resolve());
    void windowRef.once("tauri://error", (event) => reject(event.payload));
  });
}
