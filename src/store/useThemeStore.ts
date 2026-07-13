import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  applyThemeToDocument,
  type ThemeMode,
} from "@/services/theme/theme.service";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** 昼夜切换：浅色 ↔ 深色（不经过 system，状态栏一键切换） */
  toggleDayNight: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "system",

      setMode(mode) {
        applyThemeToDocument(mode);
        set({ mode });
      },

      toggleDayNight() {
        const current = get().mode;
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const effective =
          current === "system" ? (prefersDark ? "dark" : "light") : current;
        const next: ThemeMode = effective === "dark" ? "light" : "dark";
        applyThemeToDocument(next);
        set({ mode: next });
      },
    }),
    {
      name: "jlgit-theme",
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Partial<ThemeState> | undefined;
        if (!state) {
          return { mode: "system" } as ThemeState;
        }
        // v0/v1 → v2：产品默认改为跟随系统（覆盖旧默认浅色）
        if (version < 2) {
          state.mode = "system";
        }
        if (state.mode !== "light" && state.mode !== "dark" && state.mode !== "system") {
          state.mode = "system";
        }
        return state as ThemeState;
      },
      onRehydrateStorage: () => (state) => {
        applyThemeToDocument(state?.mode ?? "system");
      },
    },
  ),
);

/** 启动时立即应用（避免闪白），并监听系统主题 */
export function initTheme(): void {
  const mode = useThemeStore.getState().mode;
  applyThemeToDocument(mode);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = (): void => {
    if (useThemeStore.getState().mode === "system") {
      applyThemeToDocument("system");
    }
  };
  media.addEventListener("change", onChange);
}
