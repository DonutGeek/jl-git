import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

import i18n from "@/i18n";
import { isAppError, isRecord, type AppError } from "@/types/error";

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

function readErrorMessage(error: unknown): string | null {
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (isAppError(error) && error.message.trim()) {
    return error.message.trim();
  }
  if (isRecord(error)) {
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
    if (typeof error.error === "string" && error.error.trim()) {
      return error.error.trim();
    }
  }
  return null;
}

/** 将 updater / 网络原始错误归类为可读提示 */
function mapUpdaterUserMessage(raw: string, kind: "check" | "install"): string {
  const text = raw.toLowerCase();
  const prefix = kind === "check" ? "updateCheck" : "updateInstall";

  if (
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("deadline") ||
    text.includes("超时")
  ) {
    return i18n.t(`statusBar.${prefix}FailedTimeout`);
  }

  if (
    text.includes("404") ||
    text.includes("not found") ||
    text.includes("no such file") ||
    (text.includes("could not fetch") && text.includes("latest.json"))
  ) {
    return i18n.t(`statusBar.${prefix}FailedNotFound`);
  }

  if (
    /\b(502|503|504|500)\b/.test(text) ||
    text.includes("bad gateway") ||
    text.includes("service unavailable") ||
    text.includes("gateway timeout")
  ) {
    return i18n.t(`statusBar.${prefix}FailedServer`);
  }

  if (
    text.includes("error sending request") ||
    text.includes("connection") ||
    text.includes("connect") ||
    text.includes("dns") ||
    text.includes("network") ||
    text.includes("offline") ||
    text.includes("unreachable") ||
    text.includes("name resolution") ||
    text.includes("ssl") ||
    text.includes("tls") ||
    text.includes("certificate") ||
    text.includes("proxy")
  ) {
    return i18n.t(`statusBar.${prefix}FailedNetwork`);
  }

  // 保留截断后的原始细节，避免只有「失败」二字
  const detail = raw.replace(/\s+/g, " ").trim().slice(0, 160);
  return i18n.t(`statusBar.${prefix}FailedDetail`, { detail });
}

function toAppError(error: unknown, kind: "check" | "install"): AppError {
  const raw = readErrorMessage(error);
  if (raw) {
    return {
      code: "INTERNAL",
      message: mapUpdaterUserMessage(raw, kind),
      details: raw,
    };
  }
  return {
    code: "INTERNAL",
    message: i18n.t(kind === "check" ? "statusBar.updateCheckFailed" : "statusBar.updateFailed"),
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
    throw toAppError(error, "check");
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
    throw toAppError(new Error("NO_PENDING_UPDATE"), "install");
  }

  try {
    await update.downloadAndInstall((event) => {
      onEvent?.(event);
    });
    pendingUpdate = null;
    await relaunch();
  } catch (error) {
    throw toAppError(error, "install");
  }
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
