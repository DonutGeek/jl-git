import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OpenTabsState {
  /** 当前会话打开的仓库标签（按打开顺序） */
  tabIds: string[];
  openTab: (projectId: string) => void;
  /** 关闭标签；返回关闭后应激活的相邻 id，若无则 null（回工作台） */
  closeTab: (projectId: string) => string | null;
  /** 仅保留指定标签 */
  closeOtherTabs: (keepId: string) => void;
  /** 关闭锚点左侧全部标签 */
  closeTabsToLeft: (anchorId: string) => void;
  /** 关闭锚点右侧全部标签 */
  closeTabsToRight: (anchorId: string) => void;
  /** 拖拽重排标签顺序 */
  reorderTabs: (activeId: string, overId: string) => void;
  /** 去掉已不存在的项目 id（例如被删除后） */
  pruneTabs: (validIds: Set<string>) => void;
  clearTabs: () => void;
}

export const useOpenTabsStore = create<OpenTabsState>()(
  persist(
    (set, get) => ({
      tabIds: [],

      openTab(projectId) {
        // 已存在则不调用 set，避免无意义订阅通知
        if (get().tabIds.includes(projectId)) {
          return;
        }
        set({ tabIds: [...get().tabIds, projectId] });
      },

      closeTab(projectId) {
        const { tabIds } = get();
        const index = tabIds.indexOf(projectId);

        if (index < 0) {
          return null;
        }

        const nextTabs = tabIds.filter((id) => id !== projectId);
        set({ tabIds: nextTabs });

        if (nextTabs.length === 0) {
          return null;
        }

        // 优先右侧邻居，否则左侧
        return nextTabs[Math.min(index, nextTabs.length - 1)] ?? null;
      },

      closeOtherTabs(keepId) {
        const { tabIds } = get();
        if (!tabIds.includes(keepId)) {
          return;
        }
        if (tabIds.length === 1 && tabIds[0] === keepId) {
          return;
        }
        set({ tabIds: [keepId] });
      },

      closeTabsToLeft(anchorId) {
        const { tabIds } = get();
        const index = tabIds.indexOf(anchorId);
        if (index <= 0) {
          return;
        }
        set({ tabIds: tabIds.slice(index) });
      },

      closeTabsToRight(anchorId) {
        const { tabIds } = get();
        const index = tabIds.indexOf(anchorId);
        if (index < 0 || index >= tabIds.length - 1) {
          return;
        }
        set({ tabIds: tabIds.slice(0, index + 1) });
      },

      reorderTabs(activeId, overId) {
        if (activeId === overId) {
          return;
        }

        set((state) => {
          const from = state.tabIds.indexOf(activeId);
          const to = state.tabIds.indexOf(overId);
          if (from < 0 || to < 0) {
            return state;
          }

          const next = [...state.tabIds];
          const [moved] = next.splice(from, 1);
          if (!moved) {
            return state;
          }
          next.splice(to, 0, moved);
          return { tabIds: next };
        });
      },

      pruneTabs(validIds) {
        set((state) => {
          const next = state.tabIds.filter((id) => validIds.has(id));
          if (next.length === state.tabIds.length) {
            return state;
          }
          return { tabIds: next };
        });
      },

      clearTabs() {
        set({ tabIds: [] });
      },
    }),
    {
      name: "jlgit-open-tabs",
      partialize: (state) => ({ tabIds: state.tabIds }),
    },
  ),
);
