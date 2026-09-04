<script setup lang="ts">
import { computed, ref } from "vue";

import { Button, Form, FormItem, Input, Select, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { useHasAgentApiKey } from "@/hooks/core/useHasAgentApiKey";
import { cn } from "@/lib/utils";
import { useSettingsDrawerStore } from "@/store/modules/setting";

defineOptions({ name: "AgentComposer" });

const props = withDefaults(
  defineProps<{
    draft: string;
    isReplying?: boolean;
    canSubmit?: boolean;
    placeholder?: string;
    showThinkingToggle?: boolean;
    thinkingEnabled?: boolean;
    showModelPicker?: boolean;
    modelOptions?: readonly { value: string; label: string }[];
    modelId?: string;
    modelLoading?: boolean;
  }>(),
  {
    isReplying: false,
    canSubmit: true,
    placeholder: undefined,
    showThinkingToggle: false,
    thinkingEnabled: true,
    showModelPicker: false,
    modelOptions: () => [],
    modelId: "",
    modelLoading: false,
  },
);

const emit = defineEmits<{
  "update:draft": [value: string];
  submit: [];
  stop: [];
  "update:thinkingEnabled": [value: boolean];
  "update:modelId": [value: string];
}>();

const { t } = useI18n();
const hasApiKey = useHasAgentApiKey();
const settingsDrawerStore = useSettingsDrawerStore();
const composing = ref(false);
const skipEnterSubmit = ref(false);
const inputLocked = computed(() => !hasApiKey.value);
const inputPlaceholder = computed(() =>
  inputLocked.value
    ? t("common.aiApiKeyRequired")
    : (props.placeholder ?? t("agent.inputPlaceholder")),
);
const sendDisabled = computed(
  () =>
    inputLocked.value || !props.canSubmit || props.draft.trim().length === 0 || props.isReplying,
);

function handleSubmit(): void {
  if (sendDisabled.value) {
    if (inputLocked.value) {
      settingsDrawerStore.openDrawer("ai");
    }
    return;
  }
  emit("submit");
}

function handleEnter(event: KeyboardEvent): void {
  if (event.shiftKey || event.isComposing || composing.value || skipEnterSubmit.value) {
    return;
  }
  if (event.keyCode === 229) {
    return;
  }
  event.preventDefault();
  handleSubmit();
}

function handleCompositionStart(): void {
  composing.value = true;
}

function handleCompositionEnd(): void {
  composing.value = false;
  skipEnterSubmit.value = true;
  window.setTimeout(() => {
    skipEnterSubmit.value = false;
  }, 0);
}
</script>

<template>
  <Form class="bg-background shrink-0 px-3 pb-3 pt-1" layout="vertical" @finish="handleSubmit">
    <div
      class="border-input dark:bg-input/30 flex w-full flex-col overflow-hidden rounded-md border bg-transparent shadow-none"
    >
      <FormItem class="mb-0">
        <Input.TextArea
          :value="draft"
          :disabled="inputLocked"
          :placeholder="inputPlaceholder"
          :auto-size="{ minRows: 3, maxRows: 6 }"
          class="resize-none border-0 bg-transparent text-xs shadow-none"
          @update:value="(next) => emit('update:draft', String(next ?? ''))"
          @keydown.enter="handleEnter"
          @compositionstart="handleCompositionStart"
          @compositionend="handleCompositionEnd"
        />
      </FormItem>
      <div class="flex shrink-0 items-center justify-between gap-2 px-2 pt-1 pb-2">
        <div class="flex min-w-0 items-center gap-1.5">
          <Tooltip v-if="showThinkingToggle" :title="t('agent.deepThinkingToggle')">
            <Button
              size="small"
              :class="
                cn(
                  'h-6 border px-2 text-xs shadow-none',
                  thinkingEnabled
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground',
                )
              "
              :aria-pressed="thinkingEnabled"
              :disabled="inputLocked"
              html-type="button"
              @click="emit('update:thinkingEnabled', !thinkingEnabled)"
            >
              <template #icon>
                <Icon name="Atom" :size="14" />
              </template>
              {{ t("agent.deepThinkingToggle") }}
            </Button>
          </Tooltip>
          <Select
            v-if="showModelPicker && modelOptions.length > 0"
            class="min-w-0 max-w-[12.5rem]"
            size="small"
            :value="modelId"
            :options="[...modelOptions]"
            :disabled="inputLocked || modelLoading"
            @update:value="(next) => emit('update:modelId', String(next ?? ''))"
          />
        </div>
        <Tooltip
          :title="
            isReplying
              ? t('agent.stopReply')
              : inputLocked
                ? t('common.aiApiKeyRequired')
                : t('agent.sendMessage')
          "
        >
          <span class="inline-flex">
            <Button
              v-if="isReplying"
              type="primary"
              size="small"
              shape="circle"
              html-type="button"
              @click="emit('stop')"
            >
              <span class="bg-primary-foreground block size-2.5 shrink-0" aria-hidden="true" />
            </Button>
            <Button
              v-else
              type="primary"
              size="small"
              shape="circle"
              :disabled="sendDisabled"
              html-type="submit"
            >
              <template #icon>
                <Icon name="ArrowUp" :size="14" />
              </template>
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  </Form>
</template>
