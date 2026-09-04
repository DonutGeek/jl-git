import { requestClient } from "@/utils/http";

type InvokeArgs = Record<string, unknown>;

/**
 * Git / 系统等仍按 Command 名调用。
 * 项目域接口请写 `src/api/`，用小驼峰地址走 `requestClient`。
 */
export function invokeCommand<TResult>(command: string, args?: InvokeArgs): Promise<TResult> {
  return requestClient.post<TResult>(command, args ?? {});
}

export { normalizeInvokeError } from "@/utils/http";
