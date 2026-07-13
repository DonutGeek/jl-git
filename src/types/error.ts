export type AppErrorCode =
  | "INVALID_PATH"
  | "NOT_A_REPO"
  | "GIT_FAILED"
  | "GIT_NOT_FOUND"
  | "GIT_TIMEOUT"
  | "GIT_AUTH"
  | "DB_ERROR"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CANCELLED"
  | "INTERNAL";

export interface AppError {
  code: AppErrorCode | string;
  message: string;
  details?: string;
}

export function isAppError(value: unknown): value is AppError {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.code === "string" && typeof value.message === "string";
}

export function toUserMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }

  if (typeof error === "string") {
    const parsed = parseJsonError(error);
    return parsed?.message ?? error;
  }

  if (error instanceof Error) {
    const parsed = parseJsonError(error.message);
    return parsed?.message ?? error.message;
  }

  return "操作失败，请稍后重试";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonError(value: string): AppError | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isAppError(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
