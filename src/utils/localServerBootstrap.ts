import { getServerInfo, getSetupStatus } from "@/api/setup";
import { configureHttpAuth, requestClient } from "@/utils/http";

import { toUserMessage } from "@/types/error";

// 引导内嵌 Axum 服务：拿端口与凭据 → 注入 requestClient → 探数据库就绪状态。
// 路由守卫据此决定是否强制进入 /setup 向导。

let setupReady = false;

/** 数据库是否已配通；未就绪时守卫会把任何路由重定向到 /setup */
export function isSetupReady(): boolean {
  return setupReady;
}

/** 向导完成后调用，解除守卫的强制重定向 */
export function markSetupReady(): void {
  setupReady = true;
}

/**
 * 挂载前执行。任何一步失败都只记日志并保持未就绪，
 * 让用户落到向导页看到明确原因，而不是白屏。
 */
export async function bootstrapLocalServer(): Promise<void> {
  try {
    const info = await getServerInfo();
    requestClient.setBaseURL(info.baseUrl);
    configureHttpAuth({ getAccessToken: () => info.token });
  } catch (error) {
    console.error("[bootstrap] 无法连接本地服务:", toUserMessage(error));
    return;
  }

  try {
    const status = await getSetupStatus();
    setupReady = status.configured && status.connected && status.schemaReady;
  } catch (error) {
    console.error("[bootstrap] 无法读取数据库配置状态:", toUserMessage(error));
  }
}
