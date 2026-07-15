import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OpenTab =
  | { id: string; type: "new-tab" }
  | { id: string; type: "repository"; projectId: string };

interface OpenTabsState {
  /** 当前会话打开的标签（按打开顺序） */
  tabs: OpenTab[];
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
}

interface PersistedTabsState {
  tabs?: unknown;
  tabIds?: unknown;
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

export const useOpenTabsStore = create<OpenTabsState>()(
  persist(
    (set, get) => ({
      tabs: [],

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
        set({ tabs: nextTabs });

        return nextTabs[Math.min(index, nextTabs.length - 1)]?.id ?? null;
      },

      closeOtherTabs(keepId) {
        const { tabs } = get();
        if (!tabs.some((tab) => tab.id === keepId) || (tabs.length === 1 && tabs[0]?.id === keepId)) {
          return;
        }
        set({ tabs: tabs.filter((tab) => tab.id === keepId) });
      },

      closeTabsToLeft(anchorId) {
        const { tabs } = get();
        const index = tabs.findIndex((tab) => tab.id === anchorId);
        if (index <= 0) {
          return;
        }
        set({ tabs: tabs.slice(index) });
      },

      closeTabsToRight(anchorId) {
        const { tabs } = get();
        const index = tabs.findIndex((tab) => tab.id === anchorId);
        if (index < 0 || index >= tabs.length - 1) {
          return;
        }
        set({ tabs: tabs.slice(0, index + 1) });
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
          return { tabs: next };
        });
      },
    }),
    {
      name: "jlgit-open-tabs",
      version: 1,
      migrate: (persistedState, version) => ({
        tabs: readPersistedTabs(persistedState, version),
      }),
      partialize: (state) => ({ tabs: state.tabs }),
    },
  ),
);
