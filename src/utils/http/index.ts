import { RequestClient } from "./axios";
import type { HttpAuthAccessor } from "./types";

export { AxiosCanceler } from "./axios-cancel";
export { getHttpErrorMessage, normalizeHttpError, toAppError } from "./check-status";
export { RequestClient } from "./axios";
export { toTauriCommand } from "./tauri-adapter";
export { normalizeInvokeError } from "./tauri-error";
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

/** Vben2 风格 Axios 客户端：绝对 URL 走 HTTP，小驼峰地址走 Tauri Command */
export const requestClient = new RequestClient({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  getAccessToken: () => httpAuth.getAccessToken?.(),
  onUnauthorized: () => httpAuth.onUnauthorized?.(),
});
