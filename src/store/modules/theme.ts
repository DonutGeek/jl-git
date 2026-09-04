import { defineStore } from "pinia";

import {
  applyThemeToDocument,
  resolveEffective,
  type ThemeMode,
} from "@/services/theme/theme.service";
import { store } from "@/store";
import { deserializeZustandPersist, serializeZustandPersist } from "@/store/plugin/zustandPersist";
import {
  listenGlobalPreferenceChange,
  notifyGlobalPreferenceChange,
} from "@/services/window/globalPreferences";

/** 与旧 Zustand persist 同一把钥匙 */
const THEME_STORAGE_KEY = "jlgit-theme";
/** v5：浅色 / 深色 / 跟随系统 */
const THEME_PERSIST_VERSION = 5;

interface ThemeState {
  mode: ThemeMode;
}

function normalizeMode(raw: string | undefined): ThemeMode {
  if (raw === "light" || raw === "dark" || raw === "system") {
    return raw;
  }
  return "system";
}

function normalizeThemeState(raw: ThemeState | undefined): ThemeState {
  return { mode: normalizeMode(raw?.mode) };
}

export const useThemeStore = defineStore("theme", {
  state: (): ThemeState => ({
    mode: "system",
  }),
  actions: {
    setMode(mode: ThemeMode): void {
      const next = normalizeMode(mode);
      applyThemeToDocument(next);
      this.mode = next;
      notifyGlobalPreferenceChange("theme");
    },
    toggleDayNight(): void {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const effective = resolveEffective(this.mode, prefersDark);
      this.setMode(effective === "dark" ? "light" : "dark");
    },
  },
  persist: {
    key: THEME_STORAGE_KEY,
    serializer: {
      deserialize(value: string): ThemeState {
        const state = deserializeZustandPersist<ThemeState>(value);
        return normalizeThemeState(state);
      },
      serialize: (value) => serializeZustandPersist(value, THEME_PERSIST_VERSION),
    },
  },
});

/** setup 外取 store，对齐 vben `useXxxStoreWithOut` */
export function useThemeStoreWithOut() {
  return useThemeStore(store);
}

function syncDocumentTheme(): void {
  applyThemeToDocument(useThemeStoreWithOut().mode);
}

/** 启动时立即应用（避免闪白） */
export function initTheme(): void {
  const themeStore = useThemeStoreWithOut();
  applyThemeToDocument(themeStore.mode);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = (): void => {
    if (useThemeStoreWithOut().mode === "system") {
      applyThemeToDocument("system");
    }
  };
  media.addEventListener("change", onSystemChange);

  window.addEventListener("storage", (event) => {
    if (event.key === THEME_STORAGE_KEY) {
      themeStore.$hydrate();
      syncDocumentTheme();
    }
  });

  void listenGlobalPreferenceChange((kind) => {
    if (kind === "theme") {
      themeStore.$hydrate();
      syncDocumentTheme();
    }
  }).catch((error: unknown) => {
    console.error("Failed to listen for theme changes", error);
  });
}
