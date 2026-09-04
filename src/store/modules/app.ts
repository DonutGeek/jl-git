import { defineStore } from "pinia";

import { applyStorePatch } from "@/store/applyStorePatch";
import { store } from "@/store";
import {
  deserializeZustandPersist,
  readZustandPersistVersion,
  serializeZustandPersist,
} from "@/store/plugin/zustandPersist";

import { clearAppThemeTokenOverrides } from "@/design/themes/apply-document";
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

/** 启动时清掉旧主题包写入的 inline Token */
function applyActiveTheme(): void {
  clearAppThemeTokenOverrides();
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

interface AppPrefsData {
  clientFont: string;
  editorFont: string;
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

const APP_PREFS_PERSIST_VERSION = 19;

function migrateAppPrefs(persisted: unknown, version: number): AppPrefsData {
  const state = persisted as Partial<AppPrefsData>;
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
  if (version < 10) {
    state.activityBarOrder = normalizeActivityBarOrder(state.activityBarOrder);
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
  return {
    clientFont: normalizeClientFont(state.clientFont),
    editorFont: normalizeEditorFont(state.editorFont),
    externalEditor: typeof state.externalEditor === "string" ? state.externalEditor : "auto",
    externalEditorPath:
      typeof state.externalEditorPath === "string" ? state.externalEditorPath : "",
    externalBrowser: typeof state.externalBrowser === "string" ? state.externalBrowser : "auto",
    externalBrowserPath:
      typeof state.externalBrowserPath === "string" ? state.externalBrowserPath : "",
    shell: typeof state.shell === "string" ? state.shell : "auto",
    shellPath: typeof state.shellPath === "string" ? state.shellPath : "",
    gitExtraPath: typeof state.gitExtraPath === "string" ? state.gitExtraPath : "",
    gitExtraPathMode: state.gitExtraPathMode === "custom" ? "custom" : "auto",
    gitExtraPathAutoSeeded: Boolean(state.gitExtraPathAutoSeeded),
    launchAtLogin: Boolean(state.launchAtLogin),
    startupTabsMode: normalizeStartupTabsMode(state.startupTabsMode),
    pushAfterCommit: Boolean(state.pushAfterCommit),
    pullStrategy: normalizePullStrategy(state.pullStrategy),
    branchPrefix:
      typeof state.branchPrefix === "string" && isBranchPrefixInputValid(state.branchPrefix)
        ? normalizeBranchPrefix(state.branchPrefix)
        : DEFAULT_BRANCH_PREFIX,
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
      applyActiveTheme();
    },
  },
});

export function useAppPrefsStoreWithOut() {
  return useAppPrefsStore(store);
}

export function initAppPrefs(): void {
  const state = useAppPrefsStoreWithOut();
  applyAppFonts(state.clientFont, state.editorFont);
  applyActiveTheme();

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
