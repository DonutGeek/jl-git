import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OpenTab =
  { id: string; type: "new-tab" } | { id: string; type: "repository"; projectId: string };

interface OpenTabsState {
  /** 当前会话打开的标签（按打开顺序） */
  tabs: OpenTab[];
  /** 上次激活的标签 id（跨启动恢复用） */
  lastActiveTabId: string | null;
  /** 点击后立刻高亮的标签，路由落地后清除 */
  pendingActiveId: string | null;
  setPendingActiveId: (id: string | null) => void;
  setLastActiveTabId: (id: string | null) => void;
  /** 新建仓库选择标签并返回其唯一标识 */
  openNewTab: () => string;
  /** 打开仓库标签；同一仓库只保留一个标签 */
  openRepositoryTab: (projectId: string) => void;
  /** 将指定新标签页原地替换为仓库标签；目标仓库已打开时仅关闭该新标签页 */
  replaceNewTabWithRepository: (tabId: string, projectId: string) => void;
  /** 关闭标签；返回关闭后应激活的右侧相邻 id，若无则 null */
  closeTab: (tabId: string) => string | null;
  /** 仅保留指定标签 */
  closeOtherTabs: (keepId: string) => void;
  /** 关闭锚点左侧全部标签 */
  closeTabsToLeft: (anchorId: string) => void;
  /** 关闭锚点右侧全部标签 */
  closeTabsToRight: (anchorId: string) => void;
  /** 拖拽重排标签顺序 */
  reorderTabs: (activeId: string, overId: string) => void;
  /** 去掉已不存在的仓库标签（例如项目被删除后） */
  pruneTabs: (validProjectIds: Set<string>) => void;
  /** 冷启动「每次新标签」：清空为单个新标签页并返回其 id */
  resetToFreshStartup: () => string;
}

interface PersistedTabsState {
  tabs?: unknown;
  tabIds?: unknown;
  lastActiveTabId?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createNewTab(): OpenTab {
  return { id: `new-tab-${crypto.randomUUID()}`, type: "new-tab" };
}

function readPersistedTabs(value: unknown, version: number): OpenTab[] {
  if (!isRecord(value)) {
    return [];
  }

  const persisted = value as PersistedTabsState;

  if (version < 1 && Array.isArray(persisted.tabIds)) {
    return persisted.tabIds.flatMap((projectId) => {
      if (typeof projectId !== "string") {
        return [];
      }
      return [{ id: projectId, type: "repository" as const, projectId }];
    });
  }

  if (!Array.isArray(persisted.tabs)) {
    return [];
  }

  return persisted.tabs.reduce<OpenTab[]>((tabs, tab) => {
    if (!isRecord(tab) || typeof tab.id !== "string") {
      return tabs;
    }

    if (tab.type === "new-tab") {
      tabs.push({ id: tab.id, type: "new-tab" });
      return tabs;
    }

    if (tab.type === "repository" && typeof tab.projectId === "string") {
      tabs.push({ id: tab.id, type: "repository", projectId: tab.projectId });
    }

    return tabs;
  }, []);
}

function readLastActiveTabId(value: unknown, tabs: readonly OpenTab[]): string | null {
  if (!isRecord(value) || typeof value.lastActiveTabId !== "string") {
    return null;
  }
  return tabs.some((tab) => tab.id === value.lastActiveTabId) ? value.lastActiveTabId : null;
}

/** 标签对应主窗路由 */
export function pathForOpenTab(tab: OpenTab): string {
  if (tab.type === "new-tab") {
    return `/tab/${tab.id}`;
  }
  return `/repo/${tab.projectId}`;
}

export const useOpenTabsStore = create<OpenTabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      lastActiveTabId: null,
      pendingActiveId: null,

      setPendingActiveId(id) {
        set({ pendingActiveId: id });
      },

      setLastActiveTabId(id) {
        if (get().lastActiveTabId === id) {
          return;
        }
        set({ lastActiveTabId: id });
      },

      openNewTab() {
        const existing = get().tabs.find((tab) => tab.type === "new-tab");
        if (existing) {
          return existing.id;
        }

        const tab = createNewTab();
        set((state) => ({ tabs: [...state.tabs, tab] }));
        return tab.id;
      },

      openRepositoryTab(projectId) {
        if (get().tabs.some((tab) => tab.type === "repository" && tab.projectId === projectId)) {
          return;
        }
        set((state) => ({
          tabs: [...state.tabs, { id: projectId, type: "repository", projectId }],
        }));
      },

      replaceNewTabWithRepository(tabId, projectId) {
        const { tabs } = get();
        const index = tabs.findIndex((tab) => tab.id === tabId && tab.type === "new-tab");
        if (index < 0) {
          return;
        }

        if (tabs.some((tab) => tab.type === "repository" && tab.projectId === projectId)) {
          set({ tabs: tabs.filter((tab) => tab.id !== tabId) });
          return;
        }

        const nextTabs = [...tabs];
        nextTabs[index] = { id: projectId, type: "repository", projectId };
        set({ tabs: nextTabs });
      },

      closeTab(tabId) {
        const { tabs } = get();
        const index = tabs.findIndex((tab) => tab.id === tabId);

        if (index < 0) {
          return null;
        }

        const nextTabs = tabs.filter((tab) => tab.id !== tabId);
        const nextActive = nextTabs[Math.min(index, nextTabs.length - 1)]?.id ?? null;
        set({
          tabs: nextTabs,
          lastActiveTabId: get().lastActiveTabId === tabId ? nextActive : get().lastActiveTabId,
        });

        return nextActive;
      },

      closeOtherTabs(keepId) {
        const { tabs } = get();
        if (
          !tabs.some((tab) => tab.id === keepId) ||
          (tabs.length === 1 && tabs[0]?.id === keepId)
        ) {
          return;
        }
        set({ tabs: tabs.filter((tab) => tab.id === keepId), lastActiveTabId: keepId });
      },

      closeTabsToLeft(anchorId) {
        const { tabs } = get();
        const index = tabs.findIndex((tab) => tab.id === anchorId);
        if (index <= 0) {
          return;
        }
        const nextTabs = tabs.slice(index);
        set({
          tabs: nextTabs,
          lastActiveTabId: nextTabs.some((tab) => tab.id === get().lastActiveTabId)
            ? get().lastActiveTabId
            : anchorId,
        });
      },

      closeTabsToRight(anchorId) {
        const { tabs } = get();
        const index = tabs.findIndex((tab) => tab.id === anchorId);
        if (index < 0 || index >= tabs.length - 1) {
          return;
        }
        const nextTabs = tabs.slice(0, index + 1);
        set({
          tabs: nextTabs,
          lastActiveTabId: nextTabs.some((tab) => tab.id === get().lastActiveTabId)
            ? get().lastActiveTabId
            : anchorId,
        });
      },

      reorderTabs(activeId, overId) {
        if (activeId === overId) {
          return;
        }

        set((state) => {
          const from = state.tabs.findIndex((tab) => tab.id === activeId);
          const to = state.tabs.findIndex((tab) => tab.id === overId);
          if (from < 0 || to < 0) {
            return state;
          }

          const next = [...state.tabs];
          const [moved] = next.splice(from, 1);
          if (!moved) {
            return state;
          }
          next.splice(to, 0, moved);
          return { tabs: next };
        });
      },

      pruneTabs(validProjectIds) {
        set((state) => {
          const next = state.tabs.filter(
            (tab) => tab.type !== "repository" || validProjectIds.has(tab.projectId),
          );
          if (next.length === state.tabs.length) {
            return state;
          }
          const lastActiveTabId = next.some((tab) => tab.id === state.lastActiveTabId)
            ? state.lastActiveTabId
            : (next[next.length - 1]?.id ?? null);
          return { tabs: next, lastActiveTabId };
        });
      },

      resetToFreshStartup() {
        const tab = createNewTab();
        set({ tabs: [tab], lastActiveTabId: tab.id, pendingActiveId: null });
        return tab.id;
      },
    }),
    {
      name: "jlgit-open-tabs",
      version: 2,
      migrate: (persistedState, version) => {
        const tabs = readPersistedTabs(persistedState, version);
        return {
          tabs,
          lastActiveTabId: readLastActiveTabId(persistedState, tabs),
        };
      },
      partialize: (state) => ({
        tabs: state.tabs,
        lastActiveTabId: state.lastActiveTabId,
      }),
    },
  ),
);
