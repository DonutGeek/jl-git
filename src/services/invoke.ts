import { invoke as tauriInvoke } from "@tauri-apps/api/core";

import i18n from "@/i18n";

import type { AppError } from "@/types/error";
import { isAppError, isGitNotFoundError, isRecord } from "@/types/error";

type InvokeArgs = Record<string, unknown>;

export async function invokeCommand<TResult>(command: string, args?: InvokeArgs): Promise<TResult> {
  try {
    return await tauriInvoke<TResult>(command, args);
  } catch (error) {
    throw normalizeInvokeError(error);
  }
}

export function normalizeInvokeError(error: unknown): AppError {
  const appError = parseAppError(error);
  if (appError) {
    return refineKnownErrors(appError);
  }

  if (error instanceof Error) {
    return refineKnownErrors({
      code: "INTERNAL",
      message: error.message || "操作失败，请稍后重试",
      details: error.stack,
    });
  }

  if (typeof error === "string" && error.trim()) {
    return refineKnownErrors({
      code: "INTERNAL",
      message: error,
    });
  }

  return {
    code: "INTERNAL",
    message: "操作失败，请稍后重试",
  };
}

/** 将找不到 Git 等原始错误收成稳定 code + 用户可读文案 */
function refineKnownErrors(error: AppError): AppError {
  if (isGitNotFoundError(error)) {
    return {
      code: "GIT_NOT_FOUND",
      message: i18n.t("common.gitNotFound"),
      details: error.details ?? error.message,
    };
  }
  return error;
}

function parseAppError(value: unknown): AppError | null {
  if (isAppError(value)) {
    return value;
  }

  if (typeof value === "string") {
    return parseJsonAppError(value);
  }

  if (value instanceof Error) {
    return parseJsonAppError(value.message);
  }

  if (!isRecord(value)) {
    return null;
  }

  const wrappedError = parseAppError(value.error);
  if (wrappedError) {
    return wrappedError;
  }

  const wrappedCause = parseAppError(value.cause);
  if (wrappedCause) {
    return wrappedCause;
  }

  const wrappedMessage = parseAppError(value.message);
  if (wrappedMessage) {
    return wrappedMessage;
  }

  return null;
}

function parseJsonAppError(value: string): AppError | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parseAppError(parsed);
  } catch {
    return null;
  }
}
