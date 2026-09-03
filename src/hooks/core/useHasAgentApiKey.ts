import { onMounted, onUnmounted, ref } from "vue";

import { AI_API_KEYS_CHANGED_EVENT, getAgentKey } from "@/services/ai";

/** 是否已配置并启用鲸灵 API Key */
export function useHasAgentApiKey() {
  const hasApiKey = ref(false);

  onMounted(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      try {
        const key = await getAgentKey();
        if (!cancelled) {
          hasApiKey.value = Boolean(key);
        }
      } catch {
        if (!cancelled) {
          hasApiKey.value = false;
        }
      }
    }

    void refresh();
    const onFocus = () => void refresh();
    const onKeysChanged = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener(AI_API_KEYS_CHANGED_EVENT, onKeysChanged);

    onUnmounted(() => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(AI_API_KEYS_CHANGED_EVENT, onKeysChanged);
    });
  });

  return hasApiKey;
}
