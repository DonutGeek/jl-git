import { create } from "zustand";

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
  open: boolean;
  /** 打开时希望落到的分区；抽屉消费后清空 */
  requestedCategory: SettingsDrawerCategory | null;
  setOpen: (open: boolean) => void;
  openDrawer: (category?: SettingsDrawerCategory) => void;
  closeDrawer: () => void;
  clearRequestedCategory: () => void;
}

/** 应用设置抽屉开合（不进路由，保留当前工作区） */
export const useSettingsDrawerStore = create<SettingsDrawerState>((set) => ({
  open: false,
  requestedCategory: null,
  setOpen(open) {
    set({ open, ...(open ? {} : { requestedCategory: null }) });
  },
  openDrawer(category) {
    set({
      open: true,
      requestedCategory: category ?? null,
    });
  },
  closeDrawer() {
    set({ open: false, requestedCategory: null });
  },
  clearRequestedCategory() {
    set({ requestedCategory: null });
  },
}));
