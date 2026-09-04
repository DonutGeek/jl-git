import { isRecord } from "@/types/error";

import type { AppError } from "@/types/error";

/** 后端统一信封：`{ code, message, data }`，失败时追加语义化 `error.code` */
export interface ApiEnvelope<T = unknown> {
  code: number;
  message: string;
  data: T | null;
  error?: { code: string; details?: string };
}

/**
 * 按形状判断而非按接口清单判断，避免误伤 `src/api/deepseek.ts`
 * 这类返回官方原始结构的绝对 URL 请求。
 */
export function isApiEnvelope(value: unknown): value is ApiEnvelope {
  return (
    isRecord(value) &&
    typeof value.code === "number" &&
    typeof value.message === "string" &&
    "data" in value
  );
}

/** 信封 → 前端统一 AppError；语义码优先，缺失时按 HTTP 状态兜底 */
export function envelopeToAppError(envelope: ApiEnvelope, fallbackMessage: string): AppError {
  return {
    code: envelope.error?.code ?? (envelope.code === 401 ? "HTTP_UNAUTHORIZED" : "HTTP"),
    message: envelope.message || fallbackMessage,
    details: envelope.error?.details,
  };
}
