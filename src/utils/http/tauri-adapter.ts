import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import axios, { AxiosError } from "axios";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";

import { isRecord } from "@/types/error";

import { normalizeInvokeError } from "./tauri-error";

/** 小驼峰接口地址 → Tauri Command（snake_case）；已是 snake_case 则原样 */
export function toTauriCommand(url: string): string {
  const name = url.trim().replace(/^\//, "").split("?")[0];
  if (!name) {
    throw new Error("本地接口地址不能为空");
  }
  if (name.includes("_")) {
    return name;
  }
  return name.replace(/[A-Z]/g, (character, index: number) => {
    return `${index > 0 ? "_" : ""}${character.toLowerCase()}`;
  });
}

/**
 * 绝对 http(s) URL 与 `/api/` 前缀走真实 HTTP（内嵌 Axum 服务）；
 * 小驼峰地址即使实例有 baseURL 也走 Tauri Command，使两种通道在增量迁移期共存。
 */
export function isRemoteHttpRequest(config: { url?: string }): boolean {
  const url = config.url ?? "";
  return /^https?:\/\//i.test(url) || url.startsWith("/api/");
}

/** 是否为内嵌服务的 REST 请求（响应体带统一信封） */
export function isEnvelopeRequest(config: { url?: string }): boolean {
  return (config.url ?? "").startsWith("/api/");
}

function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

/** Axios transformRequest 可能已把 body 收成 JSON 字符串 */
function toInvokeBody(data: unknown): Record<string, unknown> {
  if (isRecord(data)) {
    return data;
  }
  if (typeof data !== "string" || !data.trim()) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(data);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toInvokeArgs(config: InternalAxiosRequestConfig): Record<string, unknown> {
  const params = isRecord(config.params) ? config.params : {};
  return omitUndefined({ ...params, ...toInvokeBody(config.data) });
}

function toAxiosResponse<T>(config: InternalAxiosRequestConfig, data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  };
}

async function invokeViaTauri(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  if (config.signal?.aborted) {
    throw new AxiosError("canceled", AxiosError.ERR_CANCELED, config);
  }

  try {
    // 不实现 Axios timeout：clone / fetch 等 Git 命令会超过默认 10s
    const data = await tauriInvoke(toTauriCommand(config.url ?? ""), toInvokeArgs(config));
    return toAxiosResponse(config, data);
  } catch (error) {
    throw normalizeInvokeError(error);
  }
}

function resolveHttpAdapter(): AxiosAdapter {
  const adapter = axios.getAdapter(["xhr", "http"]);
  return adapter;
}

/** 绝对 URL 走真实 HTTP；小驼峰地址走 Tauri Command */
export const appAxiosAdapter: AxiosAdapter = (config) => {
  if (isRemoteHttpRequest(config)) {
    return resolveHttpAdapter()(config);
  }
  return invokeViaTauri(config);
};
