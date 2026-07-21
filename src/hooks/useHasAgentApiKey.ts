import { useEffect, useState } from "react";

import { AI_API_KEYS_CHANGED_EVENT, getAgentKey } from "@/services/ai";

/**
 * 是否已配置并启用鲸灵 API Key。
 * 监听设置变更与窗口 focus，供入口置灰 / 输入禁用共用。
 */
export function useHasAgentApiKey(): boolean {
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      try {
        const key = await getAgentKey();
        if (!cancelled) {
          setHasApiKey(Boolean(key));
        }
      } catch {
        if (!cancelled) {
          setHasApiKey(false);
        }
      }
    }

    void refresh();
    const onFocus = () => void refresh();
    const onKeysChanged = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener(AI_API_KEYS_CHANGED_EVENT, onKeysChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(AI_API_KEYS_CHANGED_EVENT, onKeysChanged);
    };
  }, []);

  return hasApiKey;
}
