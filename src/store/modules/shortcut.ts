import { defineStore } from "pinia";

import { store } from "@/store";
import { deserializeZustandPersist, serializeZustandPersist } from "@/store/plugin/zustandPersist";

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

const SHORTCUT_STORAGE_KEY = "jlgit-shortcuts";

interface ShortcutState {
  bindings: Record<ShortcutId, ShortcutBinding>;
  actions: Partial<Record<ShortcutId, ShortcutAction>>;
}

function normalizeBindings(raw: unknown): Record<ShortcutId, ShortcutBinding> {
  const next = { ...DEFAULT_SHORTCUTS };
  if (typeof raw !== "object" || raw === null) {
    return next;
  }
  const record = raw as Record<string, unknown>;
  for (const id of SHORTCUT_IDS) {
    const value = record[id];
    if (value === null || typeof value === "string") {
      next[id] = value;
    }
  }
  return next;
}

export const useShortcutStore = defineStore("shortcut", {
  state: (): ShortcutState => ({
    bindings: { ...DEFAULT_SHORTCUTS },
    actions: {},
  }),
  actions: {
    setBinding(id: ShortcutId, binding: ShortcutBinding): boolean {
      if (
        binding &&
        Object.entries(this.bindings).some(([key, value]) => key !== id && value === binding)
      ) {
        return false;
      }
      this.bindings = { ...this.bindings, [id]: binding };
      return true;
    },
    resetBinding(id: ShortcutId): void {
      this.bindings = { ...this.bindings, [id]: DEFAULT_SHORTCUTS[id] };
    },
    registerAction(id: ShortcutId, action: ShortcutAction): () => void {
      this.actions = { ...this.actions, [id]: action };
      return () => {
        if (this.actions[id] !== action) {
          return;
        }
        const { [id]: _, ...actions } = this.actions;
        this.actions = actions;
      };
    },
    triggerAction(id: ShortcutId): boolean {
      const action = this.actions[id];
      if (!action) {
        return false;
      }
      void action();
      return true;
    },
  },
  persist: {
    key: SHORTCUT_STORAGE_KEY,
    pick: ["bindings"],
    serializer: {
      deserialize(value: string): Pick<ShortcutState, "bindings"> {
        const parsed = deserializeZustandPersist<{ bindings?: unknown }>(value);
        return { bindings: normalizeBindings(parsed.bindings) };
      },
      serialize: (value) => serializeZustandPersist({ bindings: value.bindings }),
    },
  },
});

export function useShortcutStoreWithOut() {
  return useShortcutStore(store);
}
