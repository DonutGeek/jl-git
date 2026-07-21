import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  listenGlobalPreferenceChange,
  notifyGlobalPreferenceChange,
} from "@/services/window/globalPreferences";

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

/** 旧版分段控件 ID → 字体族 / 系统哨兵值 */
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

/** 冷启动标签策略：恢复上次 / 仅新标签页 */
export type StartupTabsMode = "restore" | "fresh";

interface AppPrefsState {
  clientFont: string;
  editorFont: string;
  externalEditor: string;
  externalEditorPath: string;
  shell: string;
  shellPath: string;
  launchAtLogin: boolean;
  /** 冷启动时是否恢复上次打开的标签 */
  startupTabsMode: StartupTabsMode;
  pushAfterCommit: boolean;
  setClientFont: (font: string) => void;
  setEditorFont: (font: string) => void;
  setExternalEditor: (value: string) => void;
  setExternalEditorPath: (value: string) => void;
  setShell: (value: string) => void;
  setShellPath: (value: string) => void;
  setLaunchAtLogin: (value: boolean) => void;
  setStartupTabsMode: (mode: StartupTabsMode) => void;
  setPushAfterCommit: (value: boolean) => void;
}

function normalizeStartupTabsMode(value: unknown): StartupTabsMode {
  return value === "fresh" ? "fresh" : "restore";
}

/** CSS font-family 中安全引用字体族名 */
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

/** 将客户端 / 编辑器字体应用到 CSS 变量 */
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

export const useAppPrefsStore = create<AppPrefsState>()(
  persist(
    (set, get) => ({
      clientFont: DEFAULT_APP_FONT,
      editorFont: DEFAULT_APP_FONT,
      externalEditor: "auto",
      externalEditorPath: "",
      shell: "auto",
      shellPath: "",
      launchAtLogin: false,
      startupTabsMode: "restore",
      pushAfterCommit: false,

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
        // 真正注册开机自启需 Tauri autostart 插件；此处先持久化偏好
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
    }),
    {
      name: APP_PREFS_STORAGE_KEY,
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Partial<AppPrefsState> | undefined;
        if (!state) {
          return persisted as AppPrefsState;
        }
        // v0 → v1：产品默认改为 JetBrains Mono（仅替换旧的系统哨兵值）
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
        // v1 → v2：启动标签策略
        if (version < 2) {
          state.startupTabsMode = normalizeStartupTabsMode(state.startupTabsMode);
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
        state.startupTabsMode = normalizeStartupTabsMode(state.startupTabsMode);
        applyAppFonts(state.clientFont, state.editorFont);
      },
    },
  ),
);

export function initAppPrefs(): void {
  const state = useAppPrefsStore.getState();
  applyAppFonts(state.clientFont, state.editorFont);

  // 保证设置页修改字体后，已打开的子窗口也使用相同字体栈。
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
