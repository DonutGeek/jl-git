import { AxiosError } from "axios";

import type { AppMessage } from "@/hooks/web/useMessage";
import i18n from "@/i18n";
import { getDeepSeekApiKeysUrl, getDeepSeekTopUpUrl } from "@/services/ai/ai.balance";
import { openExternalUrl } from "@/api/system/open-url";
import { HttpRequestError } from "@/utils/http";

import { isAppError, isRecord, type AppError } from "@/types/error";

/** DeepSeek HTTP 错误码（与官方文档对齐） */
export const AI_BAD_REQUEST_CODE = "AI_BAD_REQUEST";
export const AI_AUTH_FAILED_CODE = "AI_AUTH_FAILED";
export const AI_BALANCE_EXHAUSTED_CODE = "AI_BALANCE_EXHAUSTED";
export const AI_INVALID_PARAMS_CODE = "AI_INVALID_PARAMS";
export const AI_RATE_LIMITED_CODE = "AI_RATE_LIMITED";
export const AI_SERVER_ERROR_CODE = "AI_SERVER_ERROR";
export const AI_SERVER_BUSY_CODE = "AI_SERVER_BUSY";

type DeepSeekMappedError = {
  code: string;
  messageKey:
    | "ai.errors.badRequest"
    | "ai.errors.authFailed"
    | "ai.errors.balanceExhausted"
    | "ai.errors.invalidParams"
    | "ai.errors.rateLimited"
    | "ai.errors.serverError"
    | "ai.errors.serverBusy";
  /** Toast 操作：打开控制台创建 Key / 去充值 */
  action?: "apiKeys" | "topUp";
};

/**
 * 将 DeepSeek HTTP 失败规范为领域错误（官方错误码产品化文案）。
 * @see https://api-docs.deepseek.com/quick_start/error_codes
 */
/** 将 requestClient / SSE fetch 的失败收成 DeepSeek 领域错误 */
export function mapDeepSeekApiError(
  error: unknown,
  fallbackMessage: string,
  timeoutMessage?: string,
): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof HttpRequestError) {
    if (error.code === AxiosError.ERR_CANCELED || error.code === AxiosError.ECONNABORTED) {
      return {
        code: error.code === AxiosError.ECONNABORTED ? "HTTP_TIMEOUT" : "CANCELLED",
        message: timeoutMessage ?? fallbackMessage,
      };
    }
    return mapDeepSeekHttpError(error.status ?? 0, error.payload, fallbackMessage);
  }

  return {
    code: "INTERNAL",
    message: fallbackMessage,
  };
}

export function mapDeepSeekHttpError(
  status: number,
  payload: unknown,
  fallbackMessage: string,
): AppError {
  const mapped = resolveDeepSeekError(status, payload);
  if (mapped) {
    return {
      code: mapped.code,
      message: i18n.t(mapped.messageKey),
      details: readDeepSeekErrorMessage(payload) ?? undefined,
    };
  }
  return {
    code: "INTERNAL",
    message: readDeepSeekErrorMessage(payload) ?? fallbackMessage,
  };
}

export function isAiBalanceExhaustedError(error: unknown): boolean {
  return isAppError(error) && error.code === AI_BALANCE_EXHAUSTED_CODE;
}

export function isAiAuthFailedError(error: unknown): boolean {
  return isAppError(error) && error.code === AI_AUTH_FAILED_CODE;
}

/** Toast 展示 AI 失败；401/402 附带跳转操作。 */
export function toastAiFailure(message: AppMessage, error: unknown): void {
  message.error(error);

  if (isAiAuthFailedError(error)) {
    void openExternalUrl(getDeepSeekApiKeysUrl()).catch(() => {
      message.error(i18n.t("settings.apiKeyOpenConsoleFailed"));
    });
    return;
  }

  if (isAiBalanceExhaustedError(error)) {
    void openExternalUrl(getDeepSeekTopUpUrl()).catch(() => {
      message.error(i18n.t("settings.balanceTopUpFailed"));
    });
  }
}

function resolveDeepSeekError(status: number, payload: unknown): DeepSeekMappedError | null {
  // 文案命中优先于状态码，避免偶发非标准 status
  if (isDeepSeekBalanceFailure(status, payload)) {
    return {
      code: AI_BALANCE_EXHAUSTED_CODE,
      messageKey: "ai.errors.balanceExhausted",
      action: "topUp",
    };
  }
  if (isDeepSeekAuthFailure(status, payload)) {
    return {
      code: AI_AUTH_FAILED_CODE,
      messageKey: "ai.errors.authFailed",
      action: "apiKeys",
    };
  }

  switch (status) {
    case 400:
      return { code: AI_BAD_REQUEST_CODE, messageKey: "ai.errors.badRequest" };
    case 401:
      return {
        code: AI_AUTH_FAILED_CODE,
        messageKey: "ai.errors.authFailed",
        action: "apiKeys",
      };
    case 402:
      return {
        code: AI_BALANCE_EXHAUSTED_CODE,
        messageKey: "ai.errors.balanceExhausted",
        action: "topUp",
      };
    case 422:
      return {
        code: AI_INVALID_PARAMS_CODE,
        messageKey: "ai.errors.invalidParams",
      };
    case 429:
      return {
        code: AI_RATE_LIMITED_CODE,
        messageKey: "ai.errors.rateLimited",
      };
    case 500:
      return {
        code: AI_SERVER_ERROR_CODE,
        messageKey: "ai.errors.serverError",
      };
    case 503:
      return { code: AI_SERVER_BUSY_CODE, messageKey: "ai.errors.serverBusy" };
    default:
      return null;
  }
}

function isDeepSeekBalanceFailure(status: number, payload: unknown): boolean {
  if (status === 402) {
    return true;
  }
  const message = readDeepSeekErrorMessage(payload);
  if (!message) {
    return false;
  }
  return /insufficient\s*balance|余额不足|balance\s*not\s*enough|run\s*out\s*of\s*balance|payment\s*required/i.test(
    message,
  );
}

function isDeepSeekAuthFailure(status: number, payload: unknown): boolean {
  if (status === 401) {
    return true;
  }
  const message = readDeepSeekErrorMessage(payload);
  if (!message) {
    return false;
  }
  return /authentication\s*fails?|invalid\s*api\s*key|incorrect\s*api\s*key|认证失败|api\s*key.*(?:invalid|wrong|incorrect)/i.test(
    message,
  );
}

function readDeepSeekErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  const error = payload.error;
  if (isRecord(error) && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  return null;
}
