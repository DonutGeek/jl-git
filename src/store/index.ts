import type { App } from "vue";

import { createPinia } from "pinia";

import { registerPiniaPersistPlugin } from "@/store/plugin/persist";

/** 全局唯一 Pinia 实例；模块 store 在组件外通过 `useXxxStore(store)` 取 */
const store = createPinia();
registerPiniaPersistPlugin(store);

/** 在 `createApp` 之后、`mount` 之前注册 */
export function setupStore(app: App): void {
  app.use(store);
}

export { store };
