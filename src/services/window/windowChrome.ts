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

/** macOS 普通窗口为交通灯留位；全屏后交通灯隐藏，恢复标准边距。 */
export function resolveWindowHeaderPaddingClass(os: AppOs, fullscreen: boolean): string {
  return os === "macos" && !fullscreen ? "pl-[88px]" : "pl-3";
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
 * - Windows / Linux：系统原生边框与窗口按钮
 */
export function createAppWindowChromeOptions(os: AppOs = detectAppOs()): AppWindowChromeOptions {
  if (os === "windows" || os === "linux") {
    return {
      decorations: true,
    };
  }
  return {
    titleBarStyle: "overlay",
    hiddenTitle: true,
    trafficLightPosition: new LogicalPosition(16, 26),
  };
}
