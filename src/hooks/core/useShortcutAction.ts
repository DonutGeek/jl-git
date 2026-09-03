import { toValue, watch, type MaybeRefOrGetter } from "vue";

import {
  useShortcutStoreWithOut,
  type ShortcutAction,
  type ShortcutId,
} from "@/store/modules/shortcut";

/** 由拥有实际业务动作的组件登记快捷键，卸载后自动失效 */
export function useShortcutAction(
  id: ShortcutId,
  action: ShortcutAction,
  enabled: MaybeRefOrGetter<boolean> = true,
): void {
  watch(
    () => toValue(enabled),
    (isEnabled, _previous, onCleanup) => {
      if (!isEnabled) {
        return;
      }
      const unregister = useShortcutStoreWithOut().registerAction(id, action);
      onCleanup(() => {
        unregister();
      });
    },
    { immediate: true },
  );
}
