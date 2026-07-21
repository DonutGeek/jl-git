import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";

const AGENT_GLOBAL_WINDOW_LABEL = "agent-global";
/** 旧窗口 label，本会话内若仍存活则复用（聚焦兼容） */
const LEGACY_WINDOW_LABELS = ["jinglv", "resume-helper"];
const AGENT_GLOBAL_WINDOW_SIZE = new LogicalSize(880, 640);

/** 创建或聚焦多仓鲸灵子窗口（单例，AgentHost = global）。 */
export async function openMultiAgentWindow(): Promise<void> {
  for (const label of [AGENT_GLOBAL_WINDOW_LABEL, ...LEGACY_WINDOW_LABELS]) {
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }
  }

  const window = new WebviewWindow(AGENT_GLOBAL_WINDOW_LABEL, {
    url: "/agent",
    title: "鲸灵",
    width: AGENT_GLOBAL_WINDOW_SIZE.width,
    height: AGENT_GLOBAL_WINDOW_SIZE.height,
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
