import { AxiosError } from "axios";

import { HttpRequestError, getHttpErrorMessage, requestClient } from "@/utils/http";

const DEEPSEEK_MODELS_URL = "https://api.deepseek.com/models";
const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";
const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";

export interface DeepSeekJsonRequestOptions {
  apiKey: string;
  timeout?: number;
  signal?: AbortSignal;
}

export interface DeepSeekStreamRequestOptions extends DeepSeekJsonRequestOptions {
  body: unknown;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
}

/** 列出当前 Key 可用的模型 */
export async function getDeepSeekModels(options: DeepSeekJsonRequestOptions): Promise<unknown> {
  return requestClient.get<unknown>(DEEPSEEK_MODELS_URL, {
    headers: authHeaders(options.apiKey),
    skipAuth: true,
    timeout: options.timeout ?? 20_000,
    signal: options.signal,
  });
}

/** 查询账户余额 */
export async function getDeepSeekBalance(options: DeepSeekJsonRequestOptions): Promise<unknown> {
  return requestClient.get<unknown>(DEEPSEEK_BALANCE_URL, {
    headers: authHeaders(options.apiKey),
    skipAuth: true,
    timeout: options.timeout ?? 20_000,
    signal: options.signal,
  });
}

/** 非流式 chat/completions */
export async function postDeepSeekChat(
  options: DeepSeekJsonRequestOptions & { body: unknown },
): Promise<unknown> {
  return requestClient.post<unknown>(DEEPSEEK_CHAT_COMPLETIONS_URL, options.body, {
    headers: {
      ...authHeaders(options.apiKey),
      "Content-Type": "application/json",
    },
    skipAuth: true,
    timeout: options.timeout ?? 30_000,
    signal: options.signal,
  });
}

/**
 * 流式 chat/completions。
 * 浏览器 Axios 无法稳定给出 SSE ReadableStream，因此仅此路径使用 fetch，仍集中在 api 层。
 */
export async function postDeepSeekChatStream(
  options: DeepSeekStreamRequestOptions,
): Promise<ReadableStream<Uint8Array>> {
  try {
    const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        ...authHeaders(options.apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options.body),
      signal: options.signal,
    });

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      throw new HttpRequestError(getHttpErrorMessage(response.status), {
        status: response.status,
        payload,
        code: AxiosError.ERR_BAD_RESPONSE,
      });
    }

    if (!response.body) {
      throw new HttpRequestError(getHttpErrorMessage(response.status), {
        status: response.status,
        code: AxiosError.ERR_BAD_RESPONSE,
      });
    }

    return response.body;
  } catch (error) {
    if (error instanceof HttpRequestError) {
      throw error;
    }
    if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new HttpRequestError(getHttpErrorMessage(408), {
        code: AxiosError.ERR_CANCELED,
        status: 408,
      });
    }
    throw error;
  }
}
