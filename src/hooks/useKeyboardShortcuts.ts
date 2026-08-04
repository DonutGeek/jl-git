import { useEffect } from "react";

import { useShortcutStore, type ShortcutId } from "@/store/useShortcutStore";
import {
  isEditableShortcutTarget,
  shortcutBindingFromKeyboardEvent,
} from "@/utils/shortcutBinding";

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  repositoryActive?: boolean;
}

const REPOSITORY_SHORTCUT_IDS: readonly ShortcutId[] = [
  "commit",
  "pull",
  "push",
  "workspace",
  "changes",
  "history",
];

/** 在应用窗口内分发用户配置的快捷键；不注册操作系统级全局快捷键。 */
export function useKeyboardShortcuts({
  enabled = true,
  repositoryActive = false,
}: UseKeyboardShortcutsOptions = {}): void {
  const bindings = useShortcutStore((state) => state.bindings);

  useEffect(() => {
    if (!enabled) {
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

      const shortcutId = (Object.keys(bindings) as ShortcutId[]).find(
        (id) => bindings[id] === binding,
      );
      if (!shortcutId) {
        return;
      }

      if (REPOSITORY_SHORTCUT_IDS.includes(shortcutId) && !repositoryActive) {
        return;
      }

      if (isEditableShortcutTarget(event.target) && shortcutId !== "commit") {
        return;
      }

      if (useShortcutStore.getState().triggerAction(shortcutId)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bindings, enabled, repositoryActive]);
}
