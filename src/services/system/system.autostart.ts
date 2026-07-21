import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

/** 查询系统是否已注册开机自启 */
export async function isLaunchAtLoginEnabled(): Promise<boolean> {
  return isEnabled();
}

/** 按偏好启用或关闭开机自启（写入系统启动项） */
export async function setLaunchAtLoginEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await enable();
    return;
  }
  await disable();
}

/**
 * 启动时对齐系统启动项：偏好默认 false（不自动开启）。
 * 仅当用户曾手动打开（preferred=true）时重新确保已注册。
 */
export async function syncLaunchAtLogin(preferred: boolean): Promise<void> {
  try {
    const current = await isEnabled();
    if (current === preferred) {
      return;
    }
    await setLaunchAtLoginEnabled(preferred);
  } catch (error) {
    console.warn("同步开机自启失败", error);
  }
}
