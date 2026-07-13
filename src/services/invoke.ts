import { invoke as tauriInvoke } from "@tauri-apps/api/core";

import { AppError, isAppError, isRecord } from "@/types/error";

type InvokeArgs = Record<string, unknown>;

export async function invokeCommand<TResult>(
  command: string,
  args?: InvokeArgs,
): Promise<TResult> {
  try {
    return await tauriInvoke<TResult>(command, args);
  } catch (error) {
    throw normalizeInvokeError(error);
  }
}

export function normalizeInvokeError(error: unknown): AppError {
  const appError = parseAppError(error);
  if (appError) {
    return appError;
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL",
      message: error.message || "操作失败，请稍后重试",
      details: error.stack,
    };
  }

  if (typeof error === "string" && error.trim()) {
    return {
      code: "INTERNAL",
      message: error,
    };
  }

  return {
    code: "INTERNAL",
    message: "操作失败，请稍后重试",
  };
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
