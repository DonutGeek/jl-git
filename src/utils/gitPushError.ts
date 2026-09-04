import type { AppMessage } from "@/hooks/web/useMessage";
import i18n from "@/i18n";
import { isAppError, toUserMessage } from "@/types/error";

/** 收集错误全文（含 details），供拒绝推送等场景做关键词识别 */
function collectErrorText(error: unknown): string {
  if (isAppError(error)) {
    return `${error.message}\n${error.details ?? ""}`;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return toUserMessage(error);
}

/**
 * 识别「远端有本地没有的提交」导致的推送拒绝（non-fast-forward / fetch first）。
 * 此类错误应引导用户先更新，而不是只展示 Git 英文原文。
 */
export function isPushRejectedError(error: unknown): boolean {
  const text = collectErrorText(error).toLowerCase();
  if (!text.trim()) {
    return false;
  }

  return (
    text.includes("fetch first") ||
    text.includes("non-fast-forward") ||
    text.includes("remote contains work that you do not") ||
    text.includes("updates were rejected because the remote contains") ||
    (text.includes("rejected") &&
      (text.includes("failed to push") || text.includes("! [rejected]")))
  );
}

interface ToastPushErrorOptions {
  /** 提供时：拒绝推送场景引导用户先更新 */
  onUpdate?: () => void;
}

/** 推送失败提示：拒绝推送时友好文案，其它错误直接写入 toast */
export function toastPushError(
  message: AppMessage,
  error: unknown,
  options: ToastPushErrorOptions = {},
): void {
  if (isPushRejectedError(error) && options.onUpdate) {
    message.error(i18n.t("repo.pushRejected"));
    return;
  }

  message.error(error);
}
