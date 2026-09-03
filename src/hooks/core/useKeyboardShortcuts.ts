import { toValue, watch, type MaybeRefOrGetter } from "vue";

import { useShortcutStoreWithOut, type ShortcutId } from "@/store/modules/shortcut";
import {
  isEditableShortcutTarget,
  shortcutBindingFromKeyboardEvent,
} from "@/utils/shortcutBinding";

interface UseKeyboardShortcutsOptions {
  enabled?: MaybeRefOrGetter<boolean>;
  repositoryActive?: MaybeRefOrGetter<boolean>;
}

const REPOSITORY_SHORTCUT_IDS: readonly ShortcutId[] = [
  "commit",
  "pull",
  "push",
  "workspace",
  "changes",
  "history",
];

/** 在应用窗口内分发用户配置的快捷键；不注册操作系统级全局快捷键 */
export function useKeyboardShortcuts({
  enabled = true,
  repositoryActive = false,
}: UseKeyboardShortcutsOptions = {}): void {
  watch(
    () => ({
      enabled: toValue(enabled),
      repositoryActive: toValue(repositoryActive),
      bindings: useShortcutStoreWithOut().bindings,
    }),
    (current, _previous, onCleanup) => {
      if (!current.enabled) {
        return;
      }

      const handleKeyDown = (event: KeyboardEvent): void => {
        if (event.defaultPrevented || event.repeat || event.isComposing) {
          return;
        }

        const binding = shortcutBindingFromKeyboardEvent(event);
        if (!binding) {
          return;
        }

        const bindings = useShortcutStoreWithOut().bindings;
        const shortcutId = (Object.keys(bindings) as ShortcutId[]).find(
          (id) => bindings[id] === binding,
        );
        if (!shortcutId) {
          return;
        }

        if (REPOSITORY_SHORTCUT_IDS.includes(shortcutId) && !current.repositoryActive) {
          return;
        }

        if (isEditableShortcutTarget(event.target) && shortcutId !== "commit") {
          return;
        }

        if (useShortcutStoreWithOut().triggerAction(shortcutId)) {
          event.preventDefault();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      onCleanup(() => {
        window.removeEventListener("keydown", handleKeyDown);
      });
    },
    { immediate: true },
  );
}
