import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SHORTCUT_IDS = [
  "switchRepository",
  "newTab",
  "openSettings",
  "commit",
  "pull",
  "push",
  "workspace",
  "changes",
  "history",
] as const;

export type ShortcutId = (typeof SHORTCUT_IDS)[number];
export type ShortcutBinding = string | null;
export type ShortcutAction = () => void | Promise<void>;

export const DEFAULT_SHORTCUTS: Record<ShortcutId, ShortcutBinding> = {
  switchRepository: "Mod+K",
  newTab: "Mod+T",
  openSettings: "Mod+,",
  commit: "Mod+Enter",
  pull: "Mod+Shift+L",
  push: "Mod+Shift+P",
  workspace: "Mod+1",
  changes: "Mod+2",
  history: "Mod+3",
};

interface ShortcutState {
  bindings: Record<ShortcutId, ShortcutBinding>;
  actions: Partial<Record<ShortcutId, ShortcutAction>>;
  setBinding: (id: ShortcutId, binding: ShortcutBinding) => boolean;
  resetBinding: (id: ShortcutId) => void;
  registerAction: (id: ShortcutId, action: ShortcutAction) => () => void;
  triggerAction: (id: ShortcutId) => boolean;
}

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set, get) => ({
      bindings: DEFAULT_SHORTCUTS,
      actions: {},
      setBinding(id, binding) {
        if (
          binding &&
          Object.entries(get().bindings).some(([key, value]) => key !== id && value === binding)
        ) {
          return false;
        }
        set((state) => ({ bindings: { ...state.bindings, [id]: binding } }));
        return true;
      },
      resetBinding(id) {
        set((state) => ({ bindings: { ...state.bindings, [id]: DEFAULT_SHORTCUTS[id] } }));
      },
      registerAction(id, action) {
        set((state) => ({ actions: { ...state.actions, [id]: action } }));
        return () => {
          if (get().actions[id] !== action) {
            return;
          }
          set((state) => {
            const { [id]: _, ...actions } = state.actions;
            return { actions };
          });
        };
      },
      triggerAction(id) {
        const action = get().actions[id];
        if (!action) {
          return false;
        }
        void action();
        return true;
      },
    }),
    {
      name: "jlgit-shortcuts",
      partialize: (state) => ({ bindings: state.bindings }),
    },
  ),
);
