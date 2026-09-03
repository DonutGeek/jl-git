<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

import { Empty } from "antdv-next";
import { useI18n } from "vue-i18n";

import AgentMessageItem from "./AgentMessageItem.vue";
import { Icon } from "@/components/Icon";
import { ScrollArea } from "@/components/ScrollArea";
import type { AgentChatMessage } from "@/types/ai";

defineOptions({ name: "AgentMessageList" });

const props = withDefaults(
  defineProps<{
    messages: readonly AgentChatMessage[];
    conversationId?: string;
    actionsDisabled?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
  }>(),
  {
    conversationId: undefined,
    actionsDisabled: false,
    emptyTitle: undefined,
    emptyDescription: undefined,
  },
);

const STICK_BOTTOM_THRESHOLD_PX = 16;
const { t } = useI18n();
const scrollArea = ref<{ viewport: HTMLElement | null } | null>(null);
const stickToBottom = ref(true);
const programmaticScroll = ref(false);
let boundViewport: HTMLElement | null = null;

function onScroll(): void {
  if (programmaticScroll.value) {
    programmaticScroll.value = false;
    return;
  }
  const viewport = boundViewport;
  if (!viewport) {
    return;
  }
  const remain = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  stickToBottom.value = remain <= STICK_BOTTOM_THRESHOLD_PX;
}

function scrollToBottomIfSticky(): void {
  if (!stickToBottom.value) {
    return;
  }
  const viewport = boundViewport ?? scrollArea.value?.viewport ?? null;
  if (!viewport) {
    return;
  }
  programmaticScroll.value = true;
  viewport.scrollTop = viewport.scrollHeight;
}

function bindViewport(viewport: HTMLElement | null): void {
  if (boundViewport) {
    boundViewport.removeEventListener("scroll", onScroll);
    boundViewport = null;
  }
  if (!viewport) {
    return;
  }
  boundViewport = viewport;
  boundViewport.addEventListener("scroll", onScroll, { passive: true });
}

watch(
  () => scrollArea.value?.viewport ?? null,
  (viewport) => {
    bindViewport(viewport);
    void nextTick(() => scrollToBottomIfSticky());
  },
);

onBeforeUnmount(() => {
  bindViewport(null);
});

watch(
  () => props.conversationId,
  () => {
    stickToBottom.value = true;
    void nextTick(() => scrollToBottomIfSticky());
  },
);

watch(
  () => props.messages,
  () => {
    void nextTick(() => scrollToBottomIfSticky());
  },
);
</script>

<template>
  <ScrollArea ref="scrollArea" class="h-full min-h-0">
    <div v-if="messages.length === 0" class="flex h-full min-h-40 items-center justify-center px-4">
      <Empty :description="null">
        <template #image>
          <Icon name="Sparkles" :size="28" class="text-muted-foreground" />
        </template>
        <p class="text-sm font-medium">{{ emptyTitle ?? t("agent.emptyState") }}</p>
        <p class="text-muted-foreground mt-1 max-w-xs text-center text-xs">
          {{ emptyDescription ?? t("agent.emptyStateDescription") }}
        </p>
      </Empty>
    </div>
    <div v-else class="flex min-w-0 flex-col gap-3 px-3 py-3">
      <AgentMessageItem
        v-for="item in messages"
        :key="item.id"
        :message="item"
        :actions-disabled="actionsDisabled"
      />
    </div>
  </ScrollArea>
</template>
