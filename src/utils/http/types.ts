import type { AxiosRequestConfig, AxiosResponse } from "axios";

export type ResponseReturnMode = "body" | "raw";

export interface RequestOptions {
  /** 不附加访问令牌 */
  skipAuth?: boolean;
  /** 取消尚未完成的相同请求；默认关闭 */
  cancelDuplicate?: boolean;
  /** 返回接口响应体，或完整 Axios 响应 */
  responseReturn?: ResponseReturnMode;
}

export type RequestConfig<D = unknown> = AxiosRequestConfig<D> & RequestOptions;

export interface HttpAuthAccessor {
  getAccessToken?: () => string | undefined;
  onUnauthorized?: () => void | Promise<void>;
}

export interface RequestClientOptions {
  baseURL: string;
  timeout?: number;
  getAccessToken?: () => string | undefined;
  onUnauthorized?: () => void | Promise<void>;
  onError?: (error: HttpRequestError) => void;
}

export class HttpRequestError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly response?: AxiosResponse;
  /** 非 Axios 通道（如 SSE fetch）也可带上响应体 */
  readonly payload?: unknown;

  constructor(
    message: string,
    options: { code?: string; status?: number; response?: AxiosResponse; payload?: unknown } = {},
  ) {
    super(message);
    this.name = "HttpRequestError";
    this.code = options.code;
    this.status = options.status;
    this.response = options.response;
    this.payload = options.payload ?? options.response?.data;
  }
}
