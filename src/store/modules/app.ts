import { defineStore } from "pinia";

import { applyStorePatch } from "@/store/applyStorePatch";
import { store } from "@/store";
import {
  deserializeZustandPersist,
  readZustandPersistVersion,
  serializeZustandPersist,
} from "@/store/plugin/zustandPersist";

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
import { getFontPreferences, setFontPreferences } from "@/services/settings/fontPreferences";
import {
  DEFAULT_ACTIVITY_BAR_ORDER,
  normalizeActivityBarOrder,
  type ActivityBarItemId,
} from "@/utils/activityBarOrder";
import {
  DEFAULT_BRANCH_PREFIX,
  isBranchPrefixInputValid,
  normalizeBranchPrefix,
} from "@/utils/branchPrefix";

/** 客户端字体：`system` 表示系统默认无衬线栈，其它为字体族名 */
export const CLIENT_FONT_SYSTEM = "system";
/** 编辑器字体：`system-mono` 表示系统默认等宽栈，其它为字体族名 */
export const EDITOR_FONT_SYSTEM = "system-mono";
/** 客户端 / 编辑器字体的产品默认值 */
export const DEFAULT_APP_FONT = "JetBrains Mono Variable";
const APP_PREFS_STORAGE_KEY = "jlgit-app-prefs";

const SYSTEM_SANS =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SYSTEM_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

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
  /** 外部浏览器：auto / 探测 id / custom */
  externalBrowser: string;
  externalBrowserPath: string;
  shell: string;
  shellPath: string;
  /** Git 子进程额外 PATH 目录（多行；供 husky 找到 node）；仅 custom 模式写入偏好 */
  gitExtraPath: string;
  /** auto：系统默认自动发现；custom：使用 gitExtraPath */
  gitExtraPathMode: "auto" | "custom";
  /** 是否已完成首次自动发现（成功注入或用户已处理）；未找到 node 时保持 false 以便下次启动再试 */
  gitExtraPathAutoSeeded: boolean;
  launchAtLogin: boolean;
  startupTabsMode: StartupTabsMode;
  pushAfterCommit: boolean;
  /** 工具栏「更新」默认策略：merge 合并 / rebase 变基 */
  pullStrategy: "merge" | "rebase";
  /** 创建分支预填 / AI 生成使用的分支名前缀 */
  branchPrefix: string;
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
  setExternalBrowser: (value: string) => void;
  setExternalBrowserPath: (value: string) => void;
  setShell: (value: string) => void;
  setShellPath: (value: string) => void;
  setGitExtraPath: (value: string) => void;
  setGitExtraPathMode: (mode: "auto" | "custom") => void;
  setLaunchAtLogin: (value: boolean) => void;
  setStartupTabsMode: (mode: StartupTabsMode) => void;
  setPushAfterCommit: (value: boolean) => void;
  setPullStrategy: (strategy: "merge" | "rebase") => void;
  /** 非法前缀时返回 false，不写入 */
  setBranchPrefix: (value: string) => boolean;
  setActivityBarOrder: (order: readonly ActivityBarItemId[]) => void;
}

function normalizeStartupTabsMode(value: unknown): StartupTabsMode {
  return value === "fresh" ? "fresh" : "restore";
}

function normalizePullStrategy(value: unknown): "merge" | "rebase" {
  return value === "rebase" ? "rebase" : "merge";
}

function isDocumentDarkNow(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function getActiveThemeChrome(
  state: Pick<
    AppPrefsState,
    "appThemeId" | "themeChromeLight" | "themeChromeDark"
  > = useAppPrefsStoreWithOut(),
): AppThemeChrome {
  const dark = isDocumentDarkNow();
  const raw = dark ? state.themeChromeDark : state.themeChromeLight;
  return normalizeAppThemeChrome(raw, state.appThemeId, dark);
}

function applyActiveTheme(
  state: Pick<AppPrefsState, "appThemeId" | "themeChromeLight" | "themeChromeDark">,
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

function normalizeClientFont(value: unknown): string {
  return value === CLIENT_FONT_SYSTEM ? CLIENT_FONT_SYSTEM : DEFAULT_APP_FONT;
}

function normalizeEditorFont(value: unknown): string {
  return value === EDITOR_FONT_SYSTEM ? EDITOR_FONT_SYSTEM : DEFAULT_APP_FONT;
}

function persistFonts(clientFont: string, editorFont: string): void {
  void setFontPreferences({ clientFont, editorFont }).catch((error: unknown) => {
    console.warn("持久化字体设置失败", error);
  });
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

interface AppPrefsData {
  clientFont: string;
  editorFont: string;
  appThemeId: AppThemeId;
  editorThemeId: AppThemeId;
  themeChromeLight: AppThemeChrome;
  themeChromeDark: AppThemeChrome;
  externalEditor: string;
  externalEditorPath: string;
  externalBrowser: string;
  externalBrowserPath: string;
  shell: string;
  shellPath: string;
  gitExtraPath: string;
  gitExtraPathMode: "auto" | "custom";
  gitExtraPathAutoSeeded: boolean;
  launchAtLogin: boolean;
  startupTabsMode: StartupTabsMode;
  pushAfterCommit: boolean;
  pullStrategy: "merge" | "rebase";
  branchPrefix: string;
  activityBarOrder: ActivityBarItemId[];
}

type AppPrefsActions = Omit<AppPrefsState, keyof AppPrefsData>;

const APP_PREFS_PERSIST_VERSION = 18;

function migrateAppPrefs(persisted: unknown, version: number): AppPrefsData {
  const state = persisted as Partial<AppPrefsData> & {
    editorChromeLight?: AppThemeChrome;
    editorChromeDark?: AppThemeChrome;
  };
  if (!state) {
    return persisted as AppPrefsData;
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
    const id = normalizeAppThemeId(state.appThemeId ?? state.editorThemeId);
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
      id === DEFAULT_APP_THEME_ID && (darkBg === "#181818" || darkBg === "#0D1117");
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
    state.activityBarOrder = normalizeActivityBarOrder(state.activityBarOrder);
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
  if (version < 13) {
    const raw = state.branchPrefix;
    state.branchPrefix =
      typeof raw === "string" && isBranchPrefixInputValid(raw)
        ? normalizeBranchPrefix(raw)
        : DEFAULT_BRANCH_PREFIX;
  }
  if (version < 14) {
    state.gitExtraPath = typeof state.gitExtraPath === "string" ? state.gitExtraPath : "";
  }
  if (version < 15) {
    // 触发一次启动自动发现：已有配置视为已处理，空配置下次启动填入
    state.gitExtraPathAutoSeeded =
      typeof state.gitExtraPath === "string" && state.gitExtraPath.trim().length > 0;
  }
  if (version < 16) {
    state.externalBrowser =
      typeof state.externalBrowser === "string" && state.externalBrowser.trim()
        ? state.externalBrowser
        : "auto";
    state.externalBrowserPath =
      typeof state.externalBrowserPath === "string" ? state.externalBrowserPath : "";
  }
  if (version < 17) {
    // 与编辑器/浏览器/终端一致：默认「系统默认」；历史自动发现路径不视为用户自定义
    state.gitExtraPathMode = "auto";
  }
  if (version < 18) {
    state.pullStrategy = "merge";
  }
  state.gitExtraPathMode = state.gitExtraPathMode === "custom" ? "custom" : "auto";
  state.pullStrategy = normalizePullStrategy(state.pullStrategy);
  return state as AppPrefsData;
}

function normalizeHydratedAppPrefs(state: AppPrefsData): AppPrefsData {
  const clientFont = normalizeClientFont(state.clientFont);
  const editorFont = normalizeEditorFont(state.editorFont);
  const id = normalizeAppThemeId(state.appThemeId ?? state.editorThemeId);
  return {
    ...state,
    clientFont,
    editorFont,
    appThemeId: id,
    editorThemeId: id,
    themeChromeLight: normalizeAppThemeChrome(state.themeChromeLight, id, false),
    themeChromeDark: normalizeAppThemeChrome(state.themeChromeDark, id, true),
    startupTabsMode: normalizeStartupTabsMode(state.startupTabsMode),
    pullStrategy: normalizePullStrategy(state.pullStrategy),
    activityBarOrder: normalizeActivityBarOrder(state.activityBarOrder),
  };
}

function appSet(
  partial:
    Partial<AppPrefsData> | ((state: AppPrefsState) => Partial<AppPrefsData> | AppPrefsState),
): void {
  applyStorePatch(useAppPrefsStoreWithOut(), partial);
}

function appGet(): AppPrefsState {
  return useAppPrefsStoreWithOut();
}

export const useAppPrefsStore = defineStore("appPrefs", {
  state: (): AppPrefsData => ({
    clientFont: DEFAULT_APP_FONT,
    editorFont: DEFAULT_APP_FONT,
    appThemeId: DEFAULT_APP_THEME_ID,
    editorThemeId: DEFAULT_APP_THEME_ID,
    themeChromeLight: chromeFromPreset(DEFAULT_APP_THEME_ID, false),
    themeChromeDark: chromeFromPreset(DEFAULT_APP_THEME_ID, true),
    externalEditor: "auto",
    externalEditorPath: "",
    externalBrowser: "auto",
    externalBrowserPath: "",
    shell: "auto",
    shellPath: "",
    gitExtraPath: "",
    gitExtraPathMode: "auto",
    gitExtraPathAutoSeeded: false,
    launchAtLogin: false,
    startupTabsMode: "restore",
    pushAfterCommit: false,
    pullStrategy: "merge",
    branchPrefix: DEFAULT_BRANCH_PREFIX,
    activityBarOrder: [...DEFAULT_ACTIVITY_BAR_ORDER],
  }),
  actions: ((set, get): AppPrefsActions => ({
    setClientFont(font) {
      const next = normalizeClientFont(font);
      const editorFont = get().editorFont;
      applyAppFonts(next, editorFont);
      set({ clientFont: next });
      persistFonts(next, editorFont);
      notifyGlobalPreferenceChange("app-prefs");
    },
    setEditorFont(font) {
      const next = normalizeEditorFont(font);
      const clientFont = get().clientFont;
      applyAppFonts(clientFont, next);
      set({ editorFont: next });
      persistFonts(clientFont, next);
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
      const merged = normalizeAppThemeChrome({ ...current, ...patch }, state.appThemeId, dark);
      const next = dark ? { themeChromeDark: merged } : { themeChromeLight: merged };
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
    setExternalBrowser(value) {
      set({ externalBrowser: value });
      notifyGlobalPreferenceChange("app-prefs");
    },
    setExternalBrowserPath(value) {
      set({ externalBrowserPath: value });
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
    setGitExtraPath(value) {
      set({ gitExtraPath: value, gitExtraPathMode: "custom", gitExtraPathAutoSeeded: true });
      notifyGlobalPreferenceChange("app-prefs");
      void import("@/services/git/git.path")
        .then(({ setGitExtraPath: sync }) => sync(value))
        .catch((error: unknown) => {
          console.warn("同步 Git 额外 PATH 失败", error);
        });
    },
    setGitExtraPathMode(mode) {
      const next = mode === "custom" ? "custom" : "auto";
      set({ gitExtraPathMode: next, gitExtraPathAutoSeeded: true });
      notifyGlobalPreferenceChange("app-prefs");
      void (async () => {
        try {
          const { discoverNodeBin, setGitExtraPath: sync } =
            await import("@/services/git/git.path");
          if (next === "custom") {
            await sync(get().gitExtraPath ?? "");
            return;
          }
          const discovered = await discoverNodeBin();
          await sync(discovered.binDir ?? "");
        } catch (error: unknown) {
          console.warn("同步 Git 额外 PATH 失败", error);
        }
      })();
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
    setPullStrategy(strategy) {
      set({ pullStrategy: normalizePullStrategy(strategy) });
      notifyGlobalPreferenceChange("app-prefs");
    },
    setBranchPrefix(value) {
      if (!isBranchPrefixInputValid(value)) {
        return false;
      }
      const next = normalizeBranchPrefix(value);
      if (next === get().branchPrefix) {
        return true;
      }
      set({ branchPrefix: next });
      notifyGlobalPreferenceChange("app-prefs");
      return true;
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
  }))(appSet, appGet),
  persist: {
    key: APP_PREFS_STORAGE_KEY,
    serializer: {
      deserialize(value: string): AppPrefsData {
        const version = readZustandPersistVersion(value);
        const persisted = deserializeZustandPersist<unknown>(value);
        return normalizeHydratedAppPrefs(migrateAppPrefs(persisted, version));
      },
      serialize: (value) => serializeZustandPersist(value, APP_PREFS_PERSIST_VERSION),
    },
    afterHydrate(ctx) {
      const prefs = ctx.store as unknown as AppPrefsData;
      applyAppFonts(prefs.clientFont, prefs.editorFont);
      applyActiveTheme(prefs);
    },
  },
});

export function useAppPrefsStoreWithOut() {
  return useAppPrefsStore(store);
}

export function initAppPrefs(): void {
  const state = useAppPrefsStoreWithOut();
  applyAppFonts(state.clientFont, state.editorFont);
  applyActiveTheme(state);

  const syncAutostart = (): void => {
    const preferred = useAppPrefsStoreWithOut().launchAtLogin;
    void import("@/services/system/system.autostart")
      .then(({ syncLaunchAtLogin }) => syncLaunchAtLogin(preferred))
      .catch((error: unknown) => {
        console.warn("同步开机自启失败", error);
      });
  };
  const syncGitExtraPath = (): void => {
    void (async () => {
      try {
        const { discoverNodeBin, setGitExtraPath: sync } = await import("@/services/git/git.path");
        const prefs = useAppPrefsStoreWithOut();
        const mode = prefs.gitExtraPathMode === "custom" ? "custom" : "auto";

        if (mode === "custom") {
          if (!prefs.gitExtraPathAutoSeeded) {
            useAppPrefsStoreWithOut().$patch({ gitExtraPathAutoSeeded: true });
          }
          await sync(prefs.gitExtraPath ?? "");
          return;
        }

        // 系统默认：运行时发现并注入，不把路径写进偏好展示
        const discovered = await discoverNodeBin();
        await sync(discovered.binDir ?? "");
        if (discovered.binDir || prefs.gitExtraPathAutoSeeded) {
          useAppPrefsStoreWithOut().$patch({ gitExtraPathAutoSeeded: true });
        }
      } catch (error: unknown) {
        console.warn("同步 Git 额外 PATH 失败", error);
      }
    })();
  };
  const syncFonts = (): void => {
    void getFontPreferences()
      .then((persisted) => {
        const current = useAppPrefsStoreWithOut();
        const clientFont = normalizeClientFont(persisted.clientFont ?? current.clientFont);
        const editorFont = normalizeEditorFont(persisted.editorFont ?? current.editorFont);
        useAppPrefsStoreWithOut().$patch({ clientFont, editorFont });
        applyAppFonts(clientFont, editorFont);
        persistFonts(clientFont, editorFont);
      })
      .catch((error: unknown) => {
        console.warn("读取字体设置失败", error);
      });
  };
  syncAutostart();
  syncGitExtraPath();
  syncFonts();

  window.addEventListener("storage", (event) => {
    if (event.key === APP_PREFS_STORAGE_KEY) {
      useAppPrefsStoreWithOut().$hydrate();
    }
  });

  void listenGlobalPreferenceChange((kind) => {
    if (kind === "app-prefs") {
      useAppPrefsStoreWithOut().$hydrate();
    }
  }).catch((error: unknown) => {
    console.error("Failed to listen for app preference changes", error);
  });
}

/** 明暗 class 变化后重刷当前主题包色到 document */
export function refreshAppThemeForColorMode(): void {
  applyActiveTheme(useAppPrefsStoreWithOut());
}
