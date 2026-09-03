import { AxiosError, isAxiosError } from "axios";

import i18n from "@/i18n";

import type { AppError } from "@/types/error";

import { HttpRequestError } from "./types";

const STATUS_MESSAGE_KEYS: Record<number, string> = {
  400: "http.badRequest",
  401: "http.unauthorized",
  403: "http.forbidden",
  404: "http.notFound",
  408: "http.timeout",
  413: "http.payloadTooLarge",
  500: "http.serverError",
  502: "http.badGateway",
  503: "http.unavailable",
  504: "http.gatewayTimeout",
};

export function getHttpErrorMessage(status?: number): string {
  const key = status ? STATUS_MESSAGE_KEYS[status] : undefined;
  return i18n.t(key ?? "http.networkFailed");
}

export function normalizeHttpError(error: unknown): HttpRequestError {
  if (!isAxiosError(error)) {
    return error instanceof HttpRequestError
      ? error
      : new HttpRequestError(i18n.t("http.networkFailed"));
  }

  if (error.code === AxiosError.ERR_CANCELED) {
    return new HttpRequestError(i18n.t("http.cancelled"), { code: error.code });
  }

  const status = error.response?.status;
  const message =
    error.code === AxiosError.ECONNABORTED ? i18n.t("http.timeout") : getHttpErrorMessage(status);

  return new HttpRequestError(message, {
    code: error.code,
    status,
    response: error.response,
    payload: error.response?.data,
  });
}

/** 将 HTTP 错误收成前端统一 AppError，供 toast / 领域层使用 */
export function toAppError(error: HttpRequestError): AppError {
  if (error.code === AxiosError.ERR_CANCELED) {
    return { code: "CANCELLED", message: error.message };
  }

  if (error.code === AxiosError.ECONNABORTED || error.status === 408) {
    return { code: "HTTP_TIMEOUT", message: error.message };
  }

  if (error.status === 401) {
    return { code: "HTTP_UNAUTHORIZED", message: error.message };
  }

  return {
    code: "HTTP",
    message: error.message,
    details: error.status != null ? String(error.status) : error.code,
  };
}
