import { getAgentKey } from "@/services/ai/ai.settings";
import { mapDeepSeekHttpError } from "@/services/ai/ai.httpError";

import i18n from "@/i18n";
import type { AppError } from "@/types/error";
import { isRecord } from "@/types/error";

/** @see https://api-docs.deepseek.com/zh-cn/api/list-models */
const DEEPSEEK_MODELS_URL = "https://api.deepseek.com/models";
const REQUEST_TIMEOUT_MS = 20_000;
const STORAGE_KEY = "jlgit:agent-model";

/**
 * 有可用列表时优先选中的模型 id（不会在接口失败时伪造列表）。
 * 流式请求在调用方未传 model 时也用此默认。
 */
export const DEFAULT_AGENT_MODEL = "deepseek-v4-pro";

/**
 * 已知支持思考模式（thinking）的模型。
 *
 * 早期公开信息常按「推理模型 vs 通用模型」划分（如 R1 有思考、V3 无）。
 * 当前官方 V4 API（Pro / Flash）已变为同一模型双模式：可用
 * `thinking: enabled/disabled` 开关；`/models` 仍不返回能力字段。
 *
 * 兼容别名：`deepseek-reasoner` ≈ Flash 思考；`deepseek-chat` ≈ Flash 非思考
 *（官方计划淘汰，见定价页说明）。
 *
 * @see https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
 * @see https://api-docs.deepseek.com/zh-cn/quick_start/pricing
 */
const THINKING_CAPABLE_MODEL_IDS = new Set<string>([
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "deepseek-reasoner",
]);

/** 当前选中模型是否展示「深度思考」开关 */
export function modelSupportsThinking(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;
  // deepseek-chat 是非思考别名，不展示开关
  if (id === "deepseek-chat") return false;
  if (THINKING_CAPABLE_MODEL_IDS.has(id)) return true;
  // 后续 deepseek-v4-* 变体默认按支持处理（与官方 V4 双模式一致）
  return /^deepseek-v4-/.test(id);
}

export interface DeepSeekModelInfo {
  id: string;
  ownedBy: string;
}

/**
 * 列出当前 Key 可用的 DeepSeek 模型（原样返回，不做本地兜底列表）。
 * @see https://api-docs.deepseek.com/zh-cn/api/list-models
 */
export async function fetchDeepSeekModels(): Promise<DeepSeekModelInfo[]> {
  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(DEEPSEEK_MODELS_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw mapDeepSeekHttpError(
        response.status,
        payload,
        i18n.t("ai.errors.modelsFetchFailed"),
      );
    }

    return parseModelsPayload(payload);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw appError("INTERNAL", i18n.t("ai.errors.modelsTimeout"));
    }
    throw appError("INTERNAL", i18n.t("ai.errors.modelsFetchFailed"));
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * 读取鲸灵已选模型。
 * 传入 availableIds 时：优先本地已存且仍可用，否则优先 DEFAULT，再否则取列表首项；无列表则空串。
 */
export function readAgentModelId(
  availableIds?: readonly string[],
): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim();
    if (raw && (!availableIds || availableIds.includes(raw))) {
      return raw;
    }
  } catch {
    // ignore
  }
  if (availableIds && availableIds.length > 0) {
    if (availableIds.includes(DEFAULT_AGENT_MODEL)) {
      return DEFAULT_AGENT_MODEL;
    }
    return availableIds[0] ?? "";
  }
  return "";
}

export function writeAgentModelId(modelId: string): void {
  const trimmed = modelId.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    // ignore quota / private mode
  }
}

/** 展示名：deepseek-v4-pro → DeepSeek V4 Pro */
export function formatDeepSeekModelLabel(modelId: string): string {
  const id = modelId.trim();
  if (!id) return id;
  const parts = id.split("-").filter(Boolean);
  if (parts.length === 0) return id;
  return parts
    .map((part) => {
      if (/^deepseek$/i.test(part)) return "DeepSeek";
      if (/^v\d+/i.test(part)) return part.toUpperCase();
      if (part.length <= 3) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

/** 空间不足时的缩写：DeepSeek V4 Pro → V4 PRO */
export function formatDeepSeekModelShortLabel(modelId: string): string {
  const full = formatDeepSeekModelLabel(modelId);
  const shortened = full.replace(/^DeepSeek\s+/i, "").trim();
  return shortened || full;
}

function parseModelsPayload(payload: unknown): DeepSeekModelInfo[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return [];
  }
  const models: DeepSeekModelInfo[] = [];
  for (const item of payload.data) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) {
      continue;
    }
    models.push({
      id: item.id.trim(),
      ownedBy: typeof item.owned_by === "string" ? item.owned_by : "deepseek",
    });
  }
  return models;
}

function appError(code: AppError["code"], message: string): AppError {
  return { code, message };
}
