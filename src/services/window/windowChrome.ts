import { LogicalPosition } from "@tauri-apps/api/dpi";

export type AppOs = "macos" | "windows" | "linux" | "unknown" | string;

/** 从 UA 同步推断 OS（首帧兜底；随后以 system_app_info 校正）。 */
export function detectAppOs(): AppOs {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

export interface AppWindowChromeOptions {
  decorations?: boolean;
  hiddenTitle?: boolean;
  titleBarStyle?: "overlay" | "visible" | "transparent";
  trafficLightPosition?: LogicalPosition;
}

/**
 * 子窗标题栏相关选项：
 * - mac：Overlay + 交通灯
 * - Windows / Linux：无系统装饰（与 tauri.{windows,linux}.conf.json 一致）
 */
export function createAppWindowChromeOptions(
  os: AppOs = detectAppOs(),
): AppWindowChromeOptions {
  if (os === "windows" || os === "linux") {
    return {
      decorations: false,
      hiddenTitle: true,
    };
  }
  return {
    titleBarStyle: "overlay",
    hiddenTitle: true,
    trafficLightPosition: new LogicalPosition(16, 26),
  };
}

/** 是否需要自绘最小化 / 最大化·还原 / 关闭 */
export function needsCustomChromeControls(os: AppOs): boolean {
  return os === "windows" || os === "linux";
}
