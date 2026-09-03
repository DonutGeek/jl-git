import type { AxiosRequestConfig } from "axios";

function serialize(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value);
}

function getRequestKey(config: AxiosRequestConfig): string {
  return [
    config.method?.toUpperCase(),
    config.url,
    serialize(config.params),
    serialize(config.data),
  ].join("&");
}

/** 管理显式开启的重复请求取消 */
export class AxiosCanceler {
  private readonly pendingRequests = new Map<string, AbortController>();

  add(config: AxiosRequestConfig): void {
    if (config.signal) {
      return;
    }

    const key = getRequestKey(config);
    this.cancel(config);

    const controller = new AbortController();
    this.pendingRequests.set(key, controller);
    config.signal = controller.signal;
  }

  remove(config: AxiosRequestConfig): void {
    this.pendingRequests.delete(getRequestKey(config));
  }

  cancel(config: AxiosRequestConfig): void {
    const key = getRequestKey(config);
    const controller = this.pendingRequests.get(key);

    if (controller) {
      controller.abort();
      this.pendingRequests.delete(key);
    }
  }

  clear(): void {
    this.pendingRequests.forEach((controller) => {
      controller.abort();
    });
    this.pendingRequests.clear();
  }
}
