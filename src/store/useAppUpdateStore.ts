import { create } from "zustand";

import type { AppUpdateInfo } from "@/services/system/system.updater";

interface AppUpdateState {
  /** 已检测到的待更新版本；无则为 null */
  availableUpdate: AppUpdateInfo | null;
  setAvailableUpdate: (info: AppUpdateInfo | null) => void;
}

/** 状态栏与设置「关于」共享更新提示，避免只在关于页可见 */
export const useAppUpdateStore = create<AppUpdateState>((set) => ({
  availableUpdate: null,
  setAvailableUpdate(info) {
    set({ availableUpdate: info });
  },
}));
