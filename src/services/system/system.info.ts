import { invokeCommand } from "@/services/invoke";

export interface SystemAppInfo {
  name: string;
  version: string;
  arch: string;
}

export interface SystemDiskSpace {
  path: string;
  totalBytes: number;
  availableBytes: number;
}

export async function getAppInfo(): Promise<SystemAppInfo> {
  return invokeCommand<SystemAppInfo>("system_app_info");
}

export async function getDiskSpace(path?: string): Promise<SystemDiskSpace> {
  return invokeCommand<SystemDiskSpace>("system_disk_space", { path });
}

/** 枚举本机已安装字体族 */
export async function listSystemFonts(): Promise<string[]> {
  return invokeCommand<string[]>("system_list_fonts");
}
