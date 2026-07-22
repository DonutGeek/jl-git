import { useEffect, useState } from "react";

import {
  AI_API_KEYS_CHANGED_EVENT,
  getAgentKey,
} from "@/services/ai/ai.settings";
import {
  fetchDeepSeekModels,
  readAgentModelId,
  writeAgentModelId,
  type DeepSeekModelInfo,
} from "@/services/ai/ai.models";

interface UseAgentModelResult {
  models: readonly DeepSeekModelInfo[];
  modelId: string;
  setModelId: (modelId: string) => void;
  loading: boolean;
}

/** 鲸灵模型：仅展示官方 /models 返回；无 Key / 失败 / 空列表时不伪造选项 */
export function useAgentModel(): UseAgentModelResult {
  const [models, setModels] = useState<DeepSeekModelInfo[]>([]);
  const [modelId, setModelIdState] = useState(() => readAgentModelId());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      const key = await getAgentKey();
      if (!key) {
        if (!active) return;
        setModels([]);
        setModelIdState(readAgentModelId([]));
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const next = await fetchDeepSeekModels();
        if (!active) return;
        setModels(next);
        const ids = next.map((item) => item.id);
        const selected = readAgentModelId(ids);
        setModelIdState(selected);
        if (selected) {
          writeAgentModelId(selected);
        }
      } catch {
        if (!active) return;
        setModels([]);
        setModelIdState(readAgentModelId([]));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    function onKeysChanged(): void {
      void load();
    }
    window.addEventListener(AI_API_KEYS_CHANGED_EVENT, onKeysChanged);
    return () => {
      active = false;
      window.removeEventListener(AI_API_KEYS_CHANGED_EVENT, onKeysChanged);
    };
  }, []);

  function setModelId(next: string): void {
    const trimmed = next.trim();
    setModelIdState(trimmed);
    if (trimmed) {
      writeAgentModelId(trimmed);
    }
  }

  return { models, modelId, setModelId, loading };
}
