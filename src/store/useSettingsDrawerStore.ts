import { create } from "zustand";

interface SettingsDrawerState {
  open: boolean;
  setOpen: (open: boolean) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

/** 应用设置抽屉开合（不进路由，保留当前工作区） */
export const useSettingsDrawerStore = create<SettingsDrawerState>((set) => ({
  open: false,
  setOpen(open) {
    set({ open });
  },
  openDrawer() {
    set({ open: true });
  },
  closeDrawer() {
    set({ open: false });
  },
}));
