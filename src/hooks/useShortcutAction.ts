import { useEffect } from "react";

import { useShortcutStore, type ShortcutAction, type ShortcutId } from "@/store/useShortcutStore";

/** 由拥有实际业务动作的组件登记快捷键，卸载后自动失效。 */
export function useShortcutAction(id: ShortcutId, action: ShortcutAction, enabled = true): void {
  const registerAction = useShortcutStore((state) => state.registerAction);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    return registerAction(id, action);
  }, [action, enabled, id, registerAction]);
}
