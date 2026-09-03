import { defineStore } from "pinia";

import { store } from "@/store";

import type { AppUpdateInfo } from "@/services/system/system.updater";

interface AppUpdateState {
  /** 已检测到的待更新版本；无则为 null */
  availableUpdate: AppUpdateInfo | null;
}

/** 状态栏与设置「关于」共享更新提示，避免只在关于页可见 */
export const useAppUpdateStore = defineStore("appUpdate", {
  state: (): AppUpdateState => ({
    availableUpdate: null,
  }),
  actions: {
    setAvailableUpdate(info: AppUpdateInfo | null): void {
      this.availableUpdate = info;
    },
  },
});

/** setup 外取 store，对齐 vben `useXxxStoreWithOut` */
export function useAppUpdateStoreWithOut() {
  return useAppUpdateStore(store);
}
