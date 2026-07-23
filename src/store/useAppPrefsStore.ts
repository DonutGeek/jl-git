import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  applyAppThemeToDocument,
  APP_THEME_CLAUDE_CODE,
  APP_THEME_CODEX,
  chromeFromPreset,
  DEFAULT_APP_THEME_ID,
  normalizeAppThemeChrome,
  normalizeAppThemeId,
  type AppThemeChrome,
  type AppThemeId,
} from "@/design/editor-themes";
import {
  listenGlobalPreferenceChange,
  notifyGlobalPreferenceChange,
} from "@/services/window/globalPreferences";
import {
  DEFAULT_ACTIVITY_BAR_ORDER,
  normalizeActivityBarOrder,
  type ActivityBarItemId,
} from "@/utils/activityBarOrder";

/** 客户端字体：`system` 表示系统默认无衬线栈，其它为字体族名 */
export const CLIENT_FONT_SYSTEM = "system";
/** 编辑器字体：`system-mono` 表示系统默认等宽栈，其它为字体族名 */
export const EDITOR_FONT_SYSTEM = "system-mono";
/** 客户端 / 编辑器字体的产品默认值 */
export const DEFAULT_APP_FONT = "JetBrains Mono";
const APP_PREFS_STORAGE_KEY = "jlgit-app-prefs";

const SYSTEM_SANS =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SYSTEM_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

const LEGACY_CLIENT_FONT: Record<string, string> = {
  system: CLIENT_FONT_SYSTEM,
  inter: "Inter",
  noto: "Noto Sans SC",
  mono: CLIENT_FONT_SYSTEM,
};

const LEGACY_EDITOR_FONT: Record<string, string> = {
  "system-mono": EDITOR_FONT_SYSTEM,
  jetbrains: "JetBrains Mono",
  fira: "Fira Code",
  cascadia: "Cascadia Code",
};

export type StartupTabsMode = "restore" | "fresh";

interface AppPrefsState {
  clientFont: string;
  editorFont: string;
  /** 应用主题包（整站 + Monaco） */
  appThemeId: AppThemeId;
  /** @deprecated 读时映射到 appThemeId */
  editorThemeId: AppThemeId;
  themeChromeLight: AppThemeChrome;
  themeChromeDark: AppThemeChrome;
  externalEditor: string;
  externalEditorPath: string;
  shell: string;
  shellPath: string;
  launchAtLogin: boolean;
  startupTabsMode: StartupTabsMode;
  pushAfterCommit: boolean;
  /** 仓库页左侧活动栏入口顺序 */
  activityBarOrder: ActivityBarItemId[];
  setClientFont: (font: string) => void;
  setEditorFont: (font: string) => void;
  /** 切换主题包：自动套用该主题明暗预设色 */
  setAppThemeId: (themeId: AppThemeId) => void;
  /** @deprecated */
  setEditorThemeId: (themeId: AppThemeId) => void;
  /** 修改当前有效明暗模式；persist 中间件会立即保存 */
  patchThemeChrome: (patch: Partial<AppThemeChrome>) => void;
  setExternalEditor: (value: string) => void;
  setExternalEditorPath: (value: string) => void;
  setShell: (value: string) => void;
  setShellPath: (value: string) => void;
  setLaunchAtLogin: (value: boolean) => void;
  setStartupTabsMode: (mode: StartupTabsMode) => void;
  setPushAfterCommit: (value: boolean) => void;
  setActivityBarOrder: (order: readonly ActivityBarItemId[]) => void;
}

function normalizeStartupTabsMode(value: unknown): StartupTabsMode {
  return value === "fresh" ? "fresh" : "restore";
}

function isDocumentDarkNow(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function getActiveThemeChrome(
  state: Pick<
    AppPrefsState,
    "appThemeId" | "themeChromeLight" | "themeChromeDark"
  > = useAppPrefsStore.getState(),
): AppThemeChrome {
  const dark = isDocumentDarkNow();
  const raw = dark ? state.themeChromeDark : state.themeChromeLight;
  return normalizeAppThemeChrome(raw, state.appThemeId, dark);
}

function applyActiveTheme(
  state: Pick<
    AppPrefsState,
    "appThemeId" | "themeChromeLight" | "themeChromeDark"
  >,
): void {
  applyAppThemeToDocument(state.appThemeId, getActiveThemeChrome(state));
}

function quoteFontFamily(name: string): string {
  if (/^[a-zA-Z0-9-]+$/.test(name)) {
    return name;
  }
  return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function resolveClientStack(clientFont: string): string {
  if (!clientFont || clientFont === CLIENT_FONT_SYSTEM) {
    return SYSTEM_SANS;
  }
  return `${quoteFontFamily(clientFont)}, ${SYSTEM_SANS}`;
}

function resolveEditorStack(editorFont: string): string {
  if (!editorFont || editorFont === EDITOR_FONT_SYSTEM) {
    return SYSTEM_MONO;
  }
  return `${quoteFontFamily(editorFont)}, ${SYSTEM_MONO}`;
}

export function applyAppFonts(clientFont: string, editorFont: string): void {
  const root = document.documentElement;
  root.style.setProperty("--font-sans", resolveClientStack(clientFont));
  root.style.setProperty("--font-mono", resolveEditorStack(editorFont));
}

function migrateFontId(
  value: string | undefined,
  legacy: Record<string, string>,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }
  return legacy[value] ?? value;
}

function applyThemePack(themeId: AppThemeId): {
  appThemeId: AppThemeId;
  editorThemeId: AppThemeId;
  themeChromeLight: AppThemeChrome;
  themeChromeDark: AppThemeChrome;
} {
  const id = normalizeAppThemeId(themeId);
  return {
    appThemeId: id,
    editorThemeId: id,
    themeChromeLight: chromeFromPreset(id, false),
    themeChromeDark: chromeFromPreset(id, true),
  };
}

export const useAppPrefsStore = create<AppPrefsState>()(
  persist(
    (set, get) => ({
      clientFont: DEFAULT_APP_FONT,
      editorFont: DEFAULT_APP_FONT,
      appThemeId: DEFAULT_APP_THEME_ID,
      editorThemeId: DEFAULT_APP_THEME_ID,
      themeChromeLight: chromeFromPreset(DEFAULT_APP_THEME_ID, false),
      themeChromeDark: chromeFromPreset(DEFAULT_APP_THEME_ID, true),
      externalEditor: "auto",
      externalEditorPath: "",
      shell: "auto",
      shellPath: "",
      launchAtLogin: false,
      startupTabsMode: "restore",
      pushAfterCommit: false,
      activityBarOrder: [...DEFAULT_ACTIVITY_BAR_ORDER],

      setClientFont(font) {
        applyAppFonts(font, get().editorFont);
        set({ clientFont: font });
        notifyGlobalPreferenceChange("app-prefs");
      },
      setEditorFont(font) {
        applyAppFonts(get().clientFont, font);
        set({ editorFont: font });
        notifyGlobalPreferenceChange("app-prefs");
      },
      setAppThemeId(themeId) {
        const next = applyThemePack(themeId);
        set(next);
        applyActiveTheme({ ...get(), ...next });
        notifyGlobalPreferenceChange("app-prefs");
      },
      setEditorThemeId(themeId) {
        get().setAppThemeId(themeId);
      },
      patchThemeChrome(patch) {
        const state = get();
        const dark = isDocumentDarkNow();
        const current = getActiveThemeChrome(state);
        const merged = normalizeAppThemeChrome(
          { ...current, ...patch },
          state.appThemeId,
          dark,
        );
        const next = dark
          ? { themeChromeDark: merged }
          : { themeChromeLight: merged };
        set(next);
        applyActiveTheme({ ...state, ...next });
        notifyGlobalPreferenceChange("app-prefs");
      },
      setExternalEditor(value) {
        set({ externalEditor: value });
        notifyGlobalPreferenceChange("app-prefs");
      },
      setExternalEditorPath(value) {
        set({ externalEditorPath: value });
        notifyGlobalPreferenceChange("app-prefs");
      },
      setShell(value) {
        set({ shell: value });
        notifyGlobalPreferenceChange("app-prefs");
      },
      setShellPath(value) {
        set({ shellPath: value });
        notifyGlobalPreferenceChange("app-prefs");
      },
      setLaunchAtLogin(value) {
        set({ launchAtLogin: value });
        notifyGlobalPreferenceChange("app-prefs");
      },
      setStartupTabsMode(mode) {
        set({ startupTabsMode: normalizeStartupTabsMode(mode) });
        notifyGlobalPreferenceChange("app-prefs");
      },
      setPushAfterCommit(value) {
        set({ pushAfterCommit: value });
        notifyGlobalPreferenceChange("app-prefs");
      },
      setActivityBarOrder(order) {
        const next = normalizeActivityBarOrder(order);
        if (
          next.length === get().activityBarOrder.length &&
          next.every((item, index) => item === get().activityBarOrder[index])
        ) {
          return;
        }
        set({ activityBarOrder: next });
        notifyGlobalPreferenceChange("app-prefs");
      },
    }),
    {
      name: APP_PREFS_STORAGE_KEY,
      version: 12,
      migrate: (persisted, version) => {
        const state = persisted as Partial<AppPrefsState> & {
          editorChromeLight?: AppThemeChrome;
          editorChromeDark?: AppThemeChrome;
        };
        if (!state) {
          return persisted as AppPrefsState;
        }
        if (version < 1) {
          if (
            !state.clientFont ||
            state.clientFont === CLIENT_FONT_SYSTEM ||
            state.clientFont === "jetbrains"
          ) {
            state.clientFont = DEFAULT_APP_FONT;
          }
          if (
            !state.editorFont ||
            state.editorFont === EDITOR_FONT_SYSTEM ||
            state.editorFont === "jetbrains"
          ) {
            state.editorFont = DEFAULT_APP_FONT;
          }
        }
        if (version < 2) {
          state.startupTabsMode = normalizeStartupTabsMode(state.startupTabsMode);
        }
        if (version < 3) {
          state.launchAtLogin = false;
        }
        if (version < 4) {
          state.appThemeId = DEFAULT_APP_THEME_ID;
          state.editorThemeId = DEFAULT_APP_THEME_ID;
        }
        if (version < 5) {
          const id = normalizeAppThemeId(
            state.appThemeId ?? state.editorThemeId,
          );
          Object.assign(state, applyThemePack(id));
          if (state.editorChromeLight && !state.themeChromeLight) {
            state.themeChromeLight = state.editorChromeLight;
          }
          if (state.editorChromeDark && !state.themeChromeDark) {
            state.themeChromeDark = state.editorChromeDark;
          }
        }
        if (version < 6) {
          // 模块化主题：按 id 重套预设；曾误把 Codex 色当「鲸灵」的，回到默认鲸灵 Git
          let id = normalizeAppThemeId(state.appThemeId ?? state.editorThemeId);
          const darkBg = String(state.themeChromeDark?.background ?? "")
            .trim()
            .toUpperCase();
          const lookedLikeFalseJingling =
            id === DEFAULT_APP_THEME_ID &&
            (darkBg === "#181818" || darkBg === "#0D1117");
          if (lookedLikeFalseJingling) {
            id = DEFAULT_APP_THEME_ID;
          }
          Object.assign(state, applyThemePack(id));
        }
        if (version < 7) {
          // 按官网/公开设计系统校准色板后，重套当前主题预设
          const id = normalizeAppThemeId(state.appThemeId ?? state.editorThemeId);
          Object.assign(state, applyThemePack(id));
        }
        if (version < 8) {
          // 主题包从三种主色扩展为完整语义色板，避免旧派生色残留在卡片、侧栏与 Diff
          const id = normalizeAppThemeId(state.appThemeId ?? state.editorThemeId);
          Object.assign(state, applyThemePack(id));
        }
        if (version < 9) {
          const id = normalizeAppThemeId(state.appThemeId ?? state.editorThemeId);
          if (id === DEFAULT_APP_THEME_ID) {
            // 修复旧派生 HEX 整套覆盖原生 OKLCH：恢复鲸灵 Git 浅/深默认配置
            Object.assign(state, applyThemePack(id));
          }
        }
        if (version < 10) {
          state.activityBarOrder = normalizeActivityBarOrder(
            state.activityBarOrder,
          );
        }
        if (version < 11) {
          const id = normalizeAppThemeId(state.appThemeId ?? state.editorThemeId);
          if (id === APP_THEME_CODEX || id === APP_THEME_CLAUDE_CODE) {
            // Codex / Claude 主题完成来源校准后，重套旧版持久化预设。
            Object.assign(state, applyThemePack(id));
          }
        }
        if (version < 12) {
          const id = normalizeAppThemeId(state.appThemeId ?? state.editorThemeId);
          if (id === APP_THEME_CODEX) {
            // ChatGPT 拆为独立主题后，恢复既有 Codex 用户的 Codex 配色。
            Object.assign(state, applyThemePack(id));
          }
        }
        return state as AppPrefsState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }
        state.clientFont = migrateFontId(
          state.clientFont,
          LEGACY_CLIENT_FONT,
          DEFAULT_APP_FONT,
        );
        state.editorFont = migrateFontId(
          state.editorFont,
          LEGACY_EDITOR_FONT,
          DEFAULT_APP_FONT,
        );
        const id = normalizeAppThemeId(state.appThemeId ?? state.editorThemeId);
        state.appThemeId = id;
        state.editorThemeId = id;
        state.themeChromeLight = normalizeAppThemeChrome(
          state.themeChromeLight,
          id,
          false,
        );
        state.themeChromeDark = normalizeAppThemeChrome(
          state.themeChromeDark,
          id,
          true,
        );
        state.startupTabsMode = normalizeStartupTabsMode(state.startupTabsMode);
        state.activityBarOrder = normalizeActivityBarOrder(
          state.activityBarOrder,
        );
        applyAppFonts(state.clientFont, state.editorFont);
        applyActiveTheme(state);
      },
    },
  ),
);

export function initAppPrefs(): void {
  const state = useAppPrefsStore.getState();
  applyAppFonts(state.clientFont, state.editorFont);
  applyActiveTheme(state);

  const syncAutostart = (): void => {
    const preferred = useAppPrefsStore.getState().launchAtLogin;
    void import("@/services/system/system.autostart")
      .then(({ syncLaunchAtLogin }) => syncLaunchAtLogin(preferred))
      .catch((error: unknown) => {
        console.warn("同步开机自启失败", error);
      });
  };
  if (useAppPrefsStore.persist.hasHydrated()) {
    syncAutostart();
  } else {
    const unsub = useAppPrefsStore.persist.onFinishHydration(() => {
      unsub();
      syncAutostart();
      applyActiveTheme(useAppPrefsStore.getState());
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key === APP_PREFS_STORAGE_KEY) {
      void useAppPrefsStore.persist.rehydrate();
    }
  });

  void listenGlobalPreferenceChange((kind) => {
    if (kind === "app-prefs") {
      void useAppPrefsStore.persist.rehydrate();
    }
  }).catch((error: unknown) => {
    console.error("Failed to listen for app preference changes", error);
  });
}

/** 明暗 class 变化后重刷当前主题包色到 document */
export function refreshAppThemeForColorMode(): void {
  applyActiveTheme(useAppPrefsStore.getState());
}
