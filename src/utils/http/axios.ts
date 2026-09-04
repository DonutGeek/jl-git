import axios, { AxiosHeaders, create } from "axios";
import type { AxiosInstance, AxiosResponse } from "axios";

import { isAppError } from "@/types/error";

import { AxiosCanceler } from "./axios-cancel";
import { normalizeHttpError } from "./check-status";
import { appAxiosAdapter, isRemoteHttpRequest } from "./tauri-adapter";
import type { RequestClientOptions, RequestConfig, RequestOptions } from "./types";

export class RequestClient {
  private readonly axios: AxiosInstance;
  private readonly canceler = new AxiosCanceler();
  private readonly options: RequestClientOptions;

  constructor(options: RequestClientOptions) {
    this.options = options;
    this.axios = create({
      baseURL: options.baseURL,
      timeout: options.timeout ?? 10_000,
      adapter: options.adapter ?? appAxiosAdapter,
    });

    this.setupInterceptors();
  }

  request<T, D = unknown>(
    config: RequestConfig<D> & { responseReturn: "raw" },
  ): Promise<AxiosResponse<T>>;
  request<T, D = unknown>(config: RequestConfig<D>): Promise<T>;
  async request<T, D = unknown>(config: RequestConfig<D>): Promise<T | AxiosResponse<T>> {
    const response = await this.axios.request<T>(config);
    return config.responseReturn === "raw" ? response : response.data;
  }

  get<T>(url: string, config: RequestConfig = {}): Promise<T> {
    return this.request<T>({ ...config, method: "GET", url });
  }

  post<T, D = unknown>(url: string, data?: D, config: RequestConfig<D> = {}): Promise<T> {
    return this.request<T, D>({ ...config, method: "POST", url, data });
  }

  put<T, D = unknown>(url: string, data?: D, config: RequestConfig<D> = {}): Promise<T> {
    return this.request<T, D>({ ...config, method: "PUT", url, data });
  }

  delete<T>(url: string, config: RequestConfig = {}): Promise<T> {
    return this.request<T>({ ...config, method: "DELETE", url });
  }

  private setupInterceptors(): void {
    this.axios.interceptors.request.use((config) => {
      const requestOptions = config as typeof config & RequestOptions;
      if (requestOptions.cancelDuplicate) {
        this.canceler.add(config);
      }

      if (!isRemoteHttpRequest(config)) {
        // 本地 Command：不要 JSON 序列化 body，也不要套 HTTP 默认超时
        config.transformRequest = [];
        config.timeout = 0;
      }

      const skipAuth =
        requestOptions.skipAuth ?? this.options.defaultSkipAuth ?? !isRemoteHttpRequest(config);
      const token = this.options.getAccessToken?.();
      if (token && !skipAuth) {
        const headers = AxiosHeaders.from(config.headers);
        headers.set("Authorization", `Bearer ${token}`);
        config.headers = headers;
      }

      return config;
    });

    this.axios.interceptors.response.use(
      (response) => {
        if ((response.config as typeof response.config & RequestOptions).cancelDuplicate) {
          this.canceler.remove(response.config);
        }
        return response;
      },
      async (error: unknown) => {
        if (isAppError(error)) {
          return Promise.reject(error);
        }

        const config = axios.isAxiosError(error) ? error.config : undefined;
        if (config && (config as typeof config & RequestOptions).cancelDuplicate) {
          this.canceler.remove(config);
        }

        const normalizedError = normalizeHttpError(error);
        if (normalizedError.status === 401) {
          await this.options.onUnauthorized?.();
        }
        this.options.onError?.(normalizedError);

        return Promise.reject(normalizedError);
      },
    );
  }
}
