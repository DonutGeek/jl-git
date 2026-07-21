import { getAgentKey } from "@/services/ai/ai.settings";

import i18n from "@/i18n";
import type { AppError } from "@/types/error";
import { isRecord } from "@/types/error";

const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";
const DEEPSEEK_TOP_UP_URL = "https://platform.deepseek.com/top_up";
/** 余额 API 官方文档 */
const DEEPSEEK_BALANCE_DOCS_URL =
  "https://api-docs.deepseek.com/zh-cn/api/get-user-balance";
const REQUEST_TIMEOUT_MS = 20_000;

export type DeepSeekCurrency = "CNY" | "USD";

export interface DeepSeekBalanceInfo {
  currency: DeepSeekCurrency;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
}

export interface DeepSeekBalanceResult {
  isAvailable: boolean;
  balances: DeepSeekBalanceInfo[];
}

export function getDeepSeekTopUpUrl(): string {
  return DEEPSEEK_TOP_UP_URL;
}

export function getDeepSeekBalanceDocsUrl(): string {
  return DEEPSEEK_BALANCE_DOCS_URL;
}

/**
 * 使用当前启用的 DeepSeek API Key 查询账户余额。
 * @see https://api-docs.deepseek.com/zh-cn/api/get-user-balance
 */
export async function fetchDeepSeekBalance(): Promise<DeepSeekBalanceResult> {
  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(DEEPSEEK_BALANCE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw appError(
        response.status === 401 || response.status === 403 ? "VALIDATION" : "INTERNAL",
        readErrorMessage(payload) ?? i18n.t("settings.balanceFetchFailed"),
      );
    }

    return parseBalancePayload(payload);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw appError("INTERNAL", i18n.t("settings.balanceTimeout"));
    }
    throw appError("INTERNAL", i18n.t("settings.balanceFetchFailed"));
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/** 优先返回 CNY 条目，否则取第一条 */
export function pickPreferredBalance(
  balances: readonly DeepSeekBalanceInfo[],
): DeepSeekBalanceInfo | null {
  return (
    balances.find((item) => item.currency === "CNY") ?? balances[0] ?? null
  );
}

function parseBalancePayload(payload: unknown): DeepSeekBalanceResult {
  if (!isRecord(payload)) {
    throw appError("INTERNAL", i18n.t("settings.balanceFetchFailed"));
  }
  const isAvailable = Boolean(payload.is_available);
  const rawList = payload.balance_infos;
  if (!Array.isArray(rawList)) {
    return { isAvailable, balances: [] };
  }

  const balances: DeepSeekBalanceInfo[] = [];
  for (const item of rawList) {
    if (!isRecord(item)) {
      continue;
    }
    const currency = item.currency;
    if (currency !== "CNY" && currency !== "USD") {
      continue;
    }
    balances.push({
      currency,
      totalBalance: readBalanceString(item.total_balance),
      grantedBalance: readBalanceString(item.granted_balance),
      toppedUpBalance: readBalanceString(item.topped_up_balance),
    });
  }
  return { isAvailable, balances };
}

function readBalanceString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "0";
}

function readErrorMessage(payload: unknown): string | null {
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

function appError(code: AppError["code"], message: string): AppError {
  return { code, message };
}
