import type { Pinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";

export function registerPiniaPersistPlugin(store: Pinia): void {
  store.use(piniaPluginPersistedstate);
}
