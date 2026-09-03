<script setup lang="ts">
import { computed, ref } from "vue";

import { Button, Modal, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { ScrollArea } from "@/components/ScrollArea";
import { cn } from "@/lib/utils";
import type { AgentConversation } from "@/types/ai";

defineOptions({ name: "AgentConversationTabs" });

const props = withDefaults(
  defineProps<{
    conversations: readonly AgentConversation[];
    activeConversationId?: string | null;
    newLabel?: string;
    untitledLabel?: string;
    deleteTitle?: string;
    confirmKey?: string;
  }>(),
  {
    activeConversationId: null,
    newLabel: undefined,
    untitledLabel: undefined,
    deleteTitle: undefined,
    confirmKey: "agent.deleteConversationConfirm",
  },
);

const emit = defineEmits<{
  select: [conversationId: string];
  create: [];
  delete: [conversationId: string];
}>();

const { t } = useI18n();
const pendingDelete = ref<AgentConversation | null>(null);
const canDelete = computed(() => props.conversations.length > 1);
const resolvedUntitled = computed(() => props.untitledLabel ?? t("agent.newConversation"));
const resolvedNewLabel = computed(() => props.newLabel ?? t("agent.createConversation"));

function conversationLabel(conversation: AgentConversation): string {
  return conversation.title || resolvedUntitled.value;
}

function requestDelete(conversation: AgentConversation): void {
  if (!canDelete.value) {
    return;
  }
  pendingDelete.value = conversation;
}

function confirmDelete(): void {
  const target = pendingDelete.value;
  if (!target) {
    return;
  }
  emit("delete", target.id);
  pendingDelete.value = null;
}
</script>

<template>
  <div class="border-border flex min-h-8 shrink-0 items-center gap-1 border-b px-2 py-1">
    <ScrollArea orientation="horizontal" class="min-w-0 flex-1">
      <div class="flex items-center gap-1">
        <div
          v-for="conversation in conversations"
          :key="conversation.id"
          :class="
            cn(
              'group relative flex h-7 min-w-14 max-w-32 items-center rounded-md text-xs leading-none',
              conversation.id === activeConversationId
                ? 'bg-accent text-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          "
        >
          <button
            type="button"
            class="flex h-full min-w-0 flex-1 items-center gap-1 truncate py-0 pr-0.5 pl-2 text-left"
            :title="conversationLabel(conversation)"
            :aria-pressed="conversation.id === activeConversationId"
            @click="emit('select', conversation.id)"
          >
            <Icon v-if="conversation.pinned" name="Pin" :size="12" class="shrink-0 opacity-70" />
            <span class="truncate">{{ conversationLabel(conversation) }}</span>
          </button>
          <Tooltip :title="t('agent.deleteConversation')">
            <button
              type="button"
              :class="
                cn(
                  'mr-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm',
                  canDelete
                    ? 'hover:bg-muted-foreground/15 cursor-pointer'
                    : 'cursor-not-allowed opacity-35',
                  conversation.id === activeConversationId
                    ? 'opacity-70'
                    : 'opacity-0 group-hover:opacity-70 focus-visible:opacity-70',
                )
              "
              :aria-label="t('agent.deleteConversation')"
              :disabled="!canDelete"
              @click.stop="requestDelete(conversation)"
            >
              <Icon name="X" :size="12" />
            </button>
          </Tooltip>
        </div>
      </div>
    </ScrollArea>
    <Tooltip :title="resolvedNewLabel">
      <Button
        type="text"
        size="small"
        class="h-7 w-7 min-w-7 p-0"
        :aria-label="resolvedNewLabel"
        @click="emit('create')"
      >
        <Icon name="Plus" :size="14" />
      </Button>
    </Tooltip>
    <Modal
      :open="Boolean(pendingDelete)"
      :title="deleteTitle ?? t('agent.deleteConversationTitle')"
      :ok-text="t('agent.deleteConversation')"
      :cancel-text="t('common.cancel')"
      ok-type="danger"
      @update:open="(open: boolean) => !open && (pendingDelete = null)"
      @ok="confirmDelete"
    >
      <p class="text-sm">
        {{
          t(confirmKey, {
            name: pendingDelete ? conversationLabel(pendingDelete) : "",
          })
        }}
      </p>
    </Modal>
  </div>
</template>
