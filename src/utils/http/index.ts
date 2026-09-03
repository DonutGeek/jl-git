import { RequestClient } from "./axios";
import type { HttpAuthAccessor } from "./types";

export { AxiosCanceler } from "./axios-cancel";
export { getHttpErrorMessage, normalizeHttpError, toAppError } from "./check-status";
export { RequestClient } from "./axios";
export { HttpRequestError } from "./types";
export type {
  HttpAuthAccessor,
  RequestClientOptions,
  RequestConfig,
  RequestOptions,
  ResponseReturnMode,
} from "./types";

/** 登录态稍后由 Pinia / 安全存储注入；未配置时不附加 Authorization */
const httpAuth: HttpAuthAccessor = {};

export function configureHttpAuth(accessor: HttpAuthAccessor): void {
  httpAuth.getAccessToken = accessor.getAccessToken;
  httpAuth.onUnauthorized = accessor.onUnauthorized;
}

export const requestClient = new RequestClient({
  // 桌面端多数请求用完整 URL；有统一网关时再配 VITE_API_BASE_URL
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  getAccessToken: () => httpAuth.getAccessToken?.(),
  onUnauthorized: () => httpAuth.onUnauthorized?.(),
});
