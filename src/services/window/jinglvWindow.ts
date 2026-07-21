import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";

const JINGLV_WINDOW_LABEL = "jinglv";
/** 旧窗口 label，本会话内若仍存活则复用 */
const LEGACY_WINDOW_LABEL = "resume-helper";
const JINGLV_WINDOW_SIZE = new LogicalSize(880, 640);

/** 创建或聚焦鲸履子窗口（单例）。 */
export async function openJinglvWindow(): Promise<void> {
  for (const label of [JINGLV_WINDOW_LABEL, LEGACY_WINDOW_LABEL]) {
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }
  }

  const window = new WebviewWindow(JINGLV_WINDOW_LABEL, {
    url: "/jinglv",
    title: "鲸履",
    width: JINGLV_WINDOW_SIZE.width,
    height: JINGLV_WINDOW_SIZE.height,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: "overlay",
    hiddenTitle: true,
    trafficLightPosition: new LogicalPosition(16, 26),
  });
  await new Promise<void>((resolve, reject) => {
    void window.once("tauri://created", () => resolve());
    void window.once("tauri://error", (event) => reject(event.payload));
  });
}
