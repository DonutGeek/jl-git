<script setup lang="ts">
import dayjs from "dayjs";
import { Button, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import AgentReasoningBlock from "./AgentReasoningBlock.vue";
import { Icon } from "@/components/Icon";
import { useMessage } from "@/hooks/web/useMessage";
import { cn } from "@/lib/utils";
import type { AgentChatMessage } from "@/types/ai";
import { copyToClipboard } from "@/utils/clipboard";

defineOptions({ name: "AgentMessageItem" });

const props = withDefaults(
  defineProps<{
    message: AgentChatMessage;
    actionsDisabled?: boolean;
  }>(),
  { actionsDisabled: false },
);

const { t } = useI18n();
const appMessage = useMessage();
const isUser = () => props.message.role === "user";

function formatMessageTime(iso: string): string {
  const time = dayjs(iso);
  if (!time.isValid()) {
    return "";
  }
  if (time.isSame(dayjs(), "day")) {
    return time.format("HH:mm:ss");
  }
  return time.format("YYYY-MM-DD HH:mm:ss");
}

const showFooter = () =>
  !props.message.isStreaming &&
  (Boolean(props.message.content.trim()) || Boolean(props.message.reasoningContent?.trim()));

async function handleCopy(): Promise<void> {
  const text = props.message.content.trim() || props.message.reasoningContent?.trim() || "";
  if (!text) {
    return;
  }
  try {
    await copyToClipboard(text);
    appMessage.success(t("agent.copySuccess"));
  } catch (error) {
    appMessage.error(error);
  }
}
</script>

<template>
  <div :class="cn('flex flex-col gap-1', isUser() ? 'items-end' : 'items-start')">
    <div
      :class="
        cn(
          'w-fit max-w-[88%] wrap-break-word rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap',
          isUser() ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        )
      "
    >
      <AgentReasoningBlock
        v-if="!isUser() && message.reasoningContent"
        :reasoning="message.reasoningContent"
        :is-streaming="Boolean(message.isStreaming)"
        :has-answer="Boolean(message.content.trim())"
        :duration-ms="message.reasoningDurationMs"
      />
      <template v-if="message.content">{{ message.content }}</template>
      <span
        v-if="message.isStreaming && message.content"
        class="bg-foreground ml-0.5 inline-block h-3 w-px animate-pulse"
        aria-hidden="true"
      />
      <span
        v-if="message.isStreaming && !message.content && !message.reasoningContent"
        class="inline-flex items-center gap-1.5"
      >
        <Icon name="LoaderCircle" :size="12" class="animate-spin" />
        <span>{{ t("agent.thinking") }}</span>
      </span>
    </div>
    <div
      v-if="showFooter()"
      :class="cn('flex items-center gap-1.5 px-0.5', isUser() ? 'flex-row-reverse' : 'flex-row')"
    >
      <time
        class="text-muted-foreground text-xs leading-none tabular-nums"
        :datetime="message.createdAt"
      >
        {{ formatMessageTime(message.createdAt) }}
      </time>
      <Tooltip :title="t('agent.copy')">
        <Button
          type="text"
          size="small"
          class="h-6 w-6 min-w-6 p-0"
          :disabled="actionsDisabled"
          @click="handleCopy"
        >
          <template #icon>
            <Icon name="Copy" :size="12" />
          </template>
        </Button>
      </Tooltip>
    </div>
  </div>
</template>
