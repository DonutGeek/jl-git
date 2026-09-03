import { computed, type ComputedRef } from "vue";

/**
 * 在组合式里按选择器读 Pinia。
 * 传入 `useXxxStore` 工厂（不要先调用）；选择器请用模块级空数组常量，避免 `?? []`。
 */
export function useZustand<TState extends object, TSelected>(
  useStore: () => TState,
  selector: (state: TState) => TSelected,
): ComputedRef<TSelected> {
  const store = useStore();
  return computed(() => selector(store));
}
