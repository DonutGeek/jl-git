import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

import i18n from "@/i18n";
import { isAppError, type AppError } from "@/types/error";

/** 检查到的应用更新摘要（不含下载句柄） */
export interface AppUpdateInfo {
  version: string;
  currentVersion: string;
  body: string | null;
  date: string | null;
}

/** 最近一次 check 得到的 Update，供「立即安装」复用 */
let pendingUpdate: Update | null = null;

function toUpdateInfo(update: Update): AppUpdateInfo {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    body: update.body ?? null,
    date: update.date ?? null,
  };
}

function toAppError(error: unknown): AppError {
  if (isAppError(error) && error.message.trim()) {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return { code: "INTERNAL", message: error.message };
  }
  return {
    code: "INTERNAL",
    message: i18n.t("statusBar.updateCheckFailed"),
  };
}

/** 向 GitHub Releases 查询是否有比当前更新的版本 */
export async function checkAppUpdate(): Promise<AppUpdateInfo | null> {
  try {
    const update = await check();
    pendingUpdate = update;
    if (!update) {
      return null;
    }
    return toUpdateInfo(update);
  } catch (error) {
    pendingUpdate = null;
    throw toAppError(error);
  }
}

/** 是否有待安装的更新（check 之后、install 之前） */
export function hasPendingAppUpdate(): boolean {
  return pendingUpdate !== null;
}

/**
 * 下载并安装最近一次 check 到的更新，完成后重启应用。
 * 须先调用 checkAppUpdate() 且结果非 null。
 */
export async function installPendingAppUpdate(
  onEvent?: (event: DownloadEvent) => void,
): Promise<void> {
  const update = pendingUpdate;
  if (!update) {
    throw new Error("NO_PENDING_UPDATE");
  }

  await update.downloadAndInstall((event) => {
    onEvent?.(event);
  });
  pendingUpdate = null;
  await relaunch();
}

/** 检查 → 若有更新则直接下载安装并重启（一键升级） */
export async function checkAndInstallAppUpdate(
  onEvent?: (event: DownloadEvent) => void,
): Promise<"up-to-date" | "installed"> {
  const info = await checkAppUpdate();
  if (!info) {
    return "up-to-date";
  }
  await installPendingAppUpdate(onEvent);
  return "installed";
}
