import { onMounted, onUnmounted, ref } from "vue";

import { AI_API_KEYS_CHANGED_EVENT, getAgentKey } from "@/services/ai/ai.settings";
import {
  fetchDeepSeekModels,
  readAgentModelId,
  writeAgentModelId,
  type DeepSeekModelInfo,
} from "@/services/ai/ai.models";

const EMPTY_MODELS: readonly DeepSeekModelInfo[] = [];

/** 鲸灵模型：仅展示官方 /models 返回；无 Key / 失败 / 空列表时不伪造选项 */
export function useAgentModel() {
  const models = ref<readonly DeepSeekModelInfo[]>(EMPTY_MODELS);
  const modelId = ref(readAgentModelId());
  const loading = ref(false);

  onMounted(() => {
    let active = true;

    async function load(): Promise<void> {
      const key = await getAgentKey();
      if (!key) {
        if (!active) {
          return;
        }
        models.value = EMPTY_MODELS;
        modelId.value = readAgentModelId([]);
        loading.value = false;
        return;
      }

      loading.value = true;
      try {
        const next = await fetchDeepSeekModels();
        if (!active) {
          return;
        }
        models.value = next;
        const ids = next.map((item) => item.id);
        const selected = readAgentModelId(ids);
        modelId.value = selected;
        if (selected) {
          writeAgentModelId(selected);
        }
      } catch {
        if (!active) {
          return;
        }
        models.value = EMPTY_MODELS;
        modelId.value = readAgentModelId([]);
      } finally {
        if (active) {
          loading.value = false;
        }
      }
    }

    void load();
    const onKeysChanged = () => void load();
    window.addEventListener(AI_API_KEYS_CHANGED_EVENT, onKeysChanged);
    onUnmounted(() => {
      active = false;
      window.removeEventListener(AI_API_KEYS_CHANGED_EVENT, onKeysChanged);
    });
  });

  function setModelId(next: string): void {
    const trimmed = next.trim();
    modelId.value = trimmed;
    if (trimmed) {
      writeAgentModelId(trimmed);
    }
  }

  return { models, modelId, setModelId, loading };
}
