import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  applyThemeToDocument,
  type ThemeMode,
} from "@/services/theme/theme.service";
import { refreshAppThemeForColorMode } from "@/store/useAppPrefsStore";
import {
  listenGlobalPreferenceChange,
  notifyGlobalPreferenceChange,
} from "@/services/window/globalPreferences";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** 昼夜切换：浅色 ↔ 深色（不经过 system，状态栏一键切换） */
  toggleDayNight: () => void;
}

const THEME_STORAGE_KEY = "jlgit-theme";

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "system",

      setMode(mode) {
        applyThemeToDocument(mode);
        refreshAppThemeForColorMode();
        set({ mode });
        notifyGlobalPreferenceChange("theme");
      },

      toggleDayNight() {
        const current = get().mode;
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const effective =
          current === "system" ? (prefersDark ? "dark" : "light") : current;
        const next: ThemeMode = effective === "dark" ? "light" : "dark";
        applyThemeToDocument(next);
        refreshAppThemeForColorMode();
        set({ mode: next });
        notifyGlobalPreferenceChange("theme");
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 3,
      migrate: (persisted, version) => {
        const state = persisted as Partial<ThemeState> | undefined;
        if (!state) {
          return { mode: "system" } as ThemeState;
        }
        // v0/v1 → 跟随系统；v2 → v3：再次对齐产品默认（旧安装可能仍停在浅色）
        if (version < 3) {
          state.mode = "system";
        }
        if (state.mode !== "light" && state.mode !== "dark" && state.mode !== "system") {
          state.mode = "system";
        }
        return state as ThemeState;
      },
      onRehydrateStorage: () => (state) => {
        applyThemeToDocument(state?.mode ?? "system");
        refreshAppThemeForColorMode();
      },
    },
  ),
);

/** 启动时立即应用（避免闪白），并监听系统主题 */
export function initTheme(): void {
  const mode = useThemeStore.getState().mode;
  applyThemeToDocument(mode);
  refreshAppThemeForColorMode();

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = (): void => {
    if (useThemeStore.getState().mode === "system") {
      applyThemeToDocument("system");
      refreshAppThemeForColorMode();
    }
  };
  media.addEventListener("change", onChange);

  // 主窗口与子窗口共享同源 localStorage；主窗口更改主题后让已打开子窗口重新水合并应用。
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_STORAGE_KEY) {
      void useThemeStore.persist.rehydrate();
    }
  });

  void listenGlobalPreferenceChange((kind) => {
    if (kind === "theme") {
      void useThemeStore.persist.rehydrate();
    }
  }).catch((error: unknown) => {
    console.error("Failed to listen for theme changes", error);
  });
}
