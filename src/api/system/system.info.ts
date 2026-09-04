import { requestClient } from "@/utils/http";

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
  return requestClient.post<SystemAppInfo>("systemAppInfo");
}

export async function getRuntimeStats(): Promise<SystemRuntimeStats> {
  return requestClient.post<SystemRuntimeStats>("systemRuntimeStats");
}

export async function getDiskSpace(path?: string): Promise<SystemDiskSpace> {
  return requestClient.post<SystemDiskSpace>("systemDiskSpace", { path });
}

/** 枚举本机可见卷（Win 盘符 / Unix 真实挂载） */
export async function listDiskVolumes(): Promise<SystemDiskSpace[]> {
  return requestClient.post<SystemDiskSpace[]>("systemDiskVolumes");
}

/** 枚举本机已安装字体族 */
export async function listSystemFonts(): Promise<string[]> {
  return requestClient.post<string[]>("systemListFonts");
}
