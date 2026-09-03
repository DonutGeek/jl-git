import { defineStore } from "pinia";

import { store } from "@/store";

/** 设置抽屉左侧分区（与 SettingsDrawer 分类一致） */
export type SettingsDrawerCategory =
  | "appearance"
  | "git"
  | "ssh"
  | "ai"
  | "tools"
  | "data"
  | "general"
  | "shortcuts"
  | "performance"
  | "about";

interface SettingsDrawerState {
  /** 抽屉是否打开；不进路由，避免拆掉当前工作区 */
  open: boolean;
  /** 打开时希望落到的分区；抽屉消费后清空 */
  requestedCategory: SettingsDrawerCategory | null;
}

export const useSettingsDrawerStore = defineStore("settingsDrawer", {
  state: (): SettingsDrawerState => ({
    open: false,
    requestedCategory: null,
  }),
  actions: {
    setOpen(open: boolean): void {
      this.open = open;
      if (!open) {
        this.requestedCategory = null;
      }
    },
    openDrawer(category?: SettingsDrawerCategory): void {
      this.open = true;
      this.requestedCategory = category ?? null;
    },
    closeDrawer(): void {
      this.open = false;
      this.requestedCategory = null;
    },
    clearRequestedCategory(): void {
      this.requestedCategory = null;
    },
  },
});

/** setup 外取 store，对齐 vben `useXxxStoreWithOut` */
export function useSettingsDrawerStoreWithOut() {
  return useSettingsDrawerStore(store);
}
