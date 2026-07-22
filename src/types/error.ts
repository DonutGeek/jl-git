import i18n from "@/i18n";

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

/** 本机找不到 / 无法启动 git（含原始 spawn ENOENT） */
export function isGitNotFoundError(error: unknown): boolean {
  if (isAppError(error)) {
    return (
      error.code === "GIT_NOT_FOUND" ||
      isGitMissingText(error.message) ||
      isGitMissingText(error.details)
    );
  }

  if (typeof error === "string") {
    return isGitMissingText(error);
  }

  if (error instanceof Error) {
    return isGitMissingText(error.message);
  }

  return false;
}

export function toUserMessage(error: unknown): string {
  if (isGitNotFoundError(error)) {
    return i18n.t("common.gitNotFound");
  }

  if (isAppError(error)) {
    return error.message;
  }

  if (typeof error === "string") {
    const parsed = parseJsonError(error);
    if (parsed && isGitNotFoundError(parsed)) {
      return i18n.t("common.gitNotFound");
    }
    return parsed?.message ?? error;
  }

  if (error instanceof Error) {
    const parsed = parseJsonError(error.message);
    if (parsed && isGitNotFoundError(parsed)) {
      return i18n.t("common.gitNotFound");
    }
    return parsed?.message ?? error.message;
  }

  return "操作失败，请稍后重试";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGitMissingText(text: string | undefined): boolean {
  if (!text?.trim()) {
    return false;
  }

  const lower = text.toLowerCase();
  if (lower.includes("spawn git enoent")) {
    return true;
  }
  if (lower.includes("enoent") && lower.includes("git")) {
    return true;
  }
  if (lower.includes("git_not_found")) {
    return true;
  }

  return (
    text.includes("无法执行 git") ||
    text.includes("未找到 Git") ||
    text.includes("未检测到本机 Git")
  );
}

function parseJsonError(value: string): AppError | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isAppError(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
