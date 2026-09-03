<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

defineOptions({ name: "AgentReasoningBlock" });

const props = withDefaults(
  defineProps<{
    reasoning: string;
    isStreaming?: boolean;
    hasAnswer?: boolean;
    durationMs?: number;
  }>(),
  { isStreaming: false, hasAnswer: false, durationMs: undefined },
);

const { t } = useI18n();
const thinking = () => props.isStreaming && !props.hasAnswer;
const open = ref(thinking());
const autoCollapsed = ref(false);

watch(
  () => [props.isStreaming, props.hasAnswer] as const,
  () => {
    if (thinking()) {
      open.value = true;
      autoCollapsed.value = false;
      return;
    }
    if (props.hasAnswer && !autoCollapsed.value) {
      open.value = false;
      autoCollapsed.value = true;
    }
  },
);

const durationSeconds = computed(() =>
  props.durationMs != null && props.durationMs >= 0
    ? Math.max(1, Math.round(props.durationMs / 1000))
    : null,
);
</script>

<template>
  <div v-if="reasoning.trim()" :class="cn(hasAnswer && 'mb-1.5')">
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-1 text-left text-[11px] leading-none font-medium"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Icon
        name="ChevronRight"
        :size="14"
        :class="cn('shrink-0 transition-transform', open && 'rotate-90')"
      />
      <span v-if="thinking()" class="inline-flex items-center gap-1.5">
        <Icon name="LoaderCircle" :size="12" class="animate-spin" />
        {{ t("agent.deepThinking") }}
      </span>
      <span v-else>
        {{
          durationSeconds != null
            ? t("agent.deepThoughtDoneWithDuration", { seconds: durationSeconds })
            : t("agent.deepThoughtDone")
        }}
      </span>
    </button>
    <div
      v-if="open"
      class="text-muted-foreground border-border/70 mt-1.5 border-l-2 pl-2.5 text-[11px] leading-relaxed whitespace-pre-wrap"
    >
      {{ reasoning }}
    </div>
  </div>
</template>
