import { defineStore } from "pinia";

import { applyThemeToDocument, type ThemeMode } from "@/services/theme/theme.service";
import { store } from "@/store";
import { refreshAppThemeForColorMode } from "@/store/modules/app";
import {
  deserializeZustandPersist,
  readZustandPersistVersion,
  serializeZustandPersist,
} from "@/store/plugin/zustandPersist";
import {
  listenGlobalPreferenceChange,
  notifyGlobalPreferenceChange,
} from "@/services/window/globalPreferences";

/** 与旧 Zustand persist 同一把钥匙 */
const THEME_STORAGE_KEY = "jlgit-theme";
/** 与旧版 migrate 对齐：v3 起默认跟随系统 */
const THEME_PERSIST_VERSION = 3;

interface ThemeState {
  /** light / dark / system（跟随 OS） */
  mode: ThemeMode;
}

function normalizeThemeState(raw: ThemeState | undefined, version: number): ThemeState {
  const mode = raw?.mode;
  // v0/v1/v2 → 跟随系统，避免旧安装停在浅色
  if (version < THEME_PERSIST_VERSION) {
    return { mode: "system" };
  }
  if (mode !== "light" && mode !== "dark" && mode !== "system") {
    return { mode: "system" };
  }
  return { mode };
}

export const useThemeStore = defineStore("theme", {
  state: (): ThemeState => ({
    mode: "system",
  }),
  actions: {
    setMode(mode: ThemeMode): void {
      applyThemeToDocument(mode);
      refreshAppThemeForColorMode();
      this.mode = mode;
      notifyGlobalPreferenceChange("theme");
    },
    /** 昼夜切换：浅色 ↔ 深色（不经过 system，状态栏一键切换） */
    toggleDayNight(): void {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const effective = this.mode === "system" ? (prefersDark ? "dark" : "light") : this.mode;
      const next: ThemeMode = effective === "dark" ? "light" : "dark";
      this.setMode(next);
    },
  },
  persist: {
    key: THEME_STORAGE_KEY,
    serializer: {
      deserialize(value: string): ThemeState {
        const version = readZustandPersistVersion(value);
        const state = deserializeZustandPersist<ThemeState>(value);
        return normalizeThemeState(state, version);
      },
      serialize: (value) => serializeZustandPersist(value, THEME_PERSIST_VERSION),
    },
  },
});

/** setup 外取 store，对齐 vben `useXxxStoreWithOut` */
export function useThemeStoreWithOut() {
  return useThemeStore(store);
}

/** 启动时立即应用（避免闪白），并监听系统主题与跨窗口变更 */
export function initTheme(): void {
  const themeStore = useThemeStoreWithOut();
  applyThemeToDocument(themeStore.mode);
  refreshAppThemeForColorMode();

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = (): void => {
    if (themeStore.mode === "system") {
      applyThemeToDocument("system");
      refreshAppThemeForColorMode();
    }
  };
  media.addEventListener("change", onChange);

  window.addEventListener("storage", (event) => {
    if (event.key === THEME_STORAGE_KEY) {
      themeStore.$hydrate();
      applyThemeToDocument(themeStore.mode);
      refreshAppThemeForColorMode();
    }
  });

  void listenGlobalPreferenceChange((kind) => {
    if (kind === "theme") {
      themeStore.$hydrate();
      applyThemeToDocument(themeStore.mode);
      refreshAppThemeForColorMode();
    }
  }).catch((error: unknown) => {
    console.error("Failed to listen for theme changes", error);
  });
}
