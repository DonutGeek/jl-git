import { invokeCommand } from "@/services/invoke";

export interface SystemAppInfo {
  name: string;
  version: string;
  arch: string;
  /** 操作系统标识（如 macos / windows / linux） */
  os: string;
}

export interface SystemRuntimeStats {
  pid: number;
  rssBytes: number;
  cpuPercent: number;
  uptimeMs: number;
  /** 取不到则为 null / undefined */
  threadCount?: number | null;
}

export interface SystemDiskSpace {
  path: string;
  totalBytes: number;
  availableBytes: number;
}

export async function getAppInfo(): Promise<SystemAppInfo> {
  return invokeCommand<SystemAppInfo>("system_app_info");
}

export async function getRuntimeStats(): Promise<SystemRuntimeStats> {
  return invokeCommand<SystemRuntimeStats>("system_runtime_stats");
}

export async function getDiskSpace(path?: string): Promise<SystemDiskSpace> {
  return invokeCommand<SystemDiskSpace>("system_disk_space", { path });
}

/** 枚举本机已安装字体族 */
export async function listSystemFonts(): Promise<string[]> {
  return invokeCommand<string[]>("system_list_fonts");
}
