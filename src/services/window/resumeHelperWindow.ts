import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";

const RESUME_HELPER_WINDOW_LABEL = "resume-helper";
const RESUME_HELPER_WINDOW_SIZE = new LogicalSize(880, 640);

/** 创建或聚焦简历帮子窗口（单例）。 */
export async function openResumeHelperWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(RESUME_HELPER_WINDOW_LABEL);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const window = new WebviewWindow(RESUME_HELPER_WINDOW_LABEL, {
    url: "/resume-helper",
    title: "简历帮",
    width: RESUME_HELPER_WINDOW_SIZE.width,
    height: RESUME_HELPER_WINDOW_SIZE.height,
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
