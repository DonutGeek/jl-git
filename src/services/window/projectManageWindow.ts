import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";

import { createAppWindowChromeOptions } from "@/services/window/windowChrome";

const PROJECT_MANAGE_WINDOW_LABEL = "project-manage";
const PROJECT_MANAGE_WINDOW_SIZE = new LogicalSize(1280, 840);

/** 创建或聚焦「仓库管理」浮动子窗口（单例）。 */
export async function openProjectManageWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(PROJECT_MANAGE_WINDOW_LABEL);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const window = new WebviewWindow(PROJECT_MANAGE_WINDOW_LABEL, {
    url: "/project-manage",
    title: "仓库管理",
    width: PROJECT_MANAGE_WINDOW_SIZE.width,
    height: PROJECT_MANAGE_WINDOW_SIZE.height,
    minWidth: 960,
    minHeight: 640,
    ...createAppWindowChromeOptions(),
  });
  await new Promise<void>((resolve, reject) => {
    void window.once("tauri://created", () => resolve());
    void window.once("tauri://error", (event) => reject(event.payload));
  });
}
