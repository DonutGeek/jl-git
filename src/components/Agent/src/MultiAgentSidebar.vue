<script setup lang="ts">
import { computed } from "vue";

import { Button, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { ScrollArea } from "@/components/ScrollArea";
import { useModal } from "@/hooks/web/useModal";
import { cn } from "@/lib/utils";
import type { AgentConversation } from "@/types/ai";

defineOptions({ name: "MultiAgentSidebar" });

const props = withDefaults(
  defineProps<{
    conversations: readonly AgentConversation[];
    activeConversationId?: string | null;
  }>(),
  { activeConversationId: null },
);

const emit = defineEmits<{
  select: [conversationId: string];
  create: [];
  delete: [conversationId: string];
}>();

const { t } = useI18n();
const modal = useModal();
const canDelete = computed(() => props.conversations.length > 1);

function conversationLabel(conversation: AgentConversation): string {
  return conversation.title || t("multiAgent.newConversation");
}

function requestDelete(conversation: AgentConversation): void {
  if (!canDelete.value) {
    return;
  }
  modal.confirm({
    title: t("multiAgent.deleteConversationTitle"),
    content: t("multiAgent.deleteConversationConfirm", { name: conversationLabel(conversation) }),
    icon: null,
    okType: "danger",
    okText: t("multiAgent.deleteConversation"),
    onOk() {
      emit("delete", conversation.id);
    },
  });
}
</script>

<template>
  <aside class="border-border bg-muted/20 flex w-48 shrink-0 flex-col border-r">
    <div class="shrink-0 p-2">
      <Tooltip :title="t('multiAgent.createConversation')" placement="right">
        <Button
          size="small"
          class="h-8 w-full justify-start gap-1.5 text-xs"
          @click="emit('create')"
        >
          <template #icon>
            <Icon name="SquarePen" :size="14" />
          </template>
          {{ t("multiAgent.createConversation") }}
        </Button>
      </Tooltip>
    </div>
    <ScrollArea class="min-h-0 flex-1">
      <div class="flex flex-col gap-0.5 px-2 pb-2">
        <div
          v-for="conversation in conversations"
          :key="conversation.id"
          :class="
            cn(
              'group flex h-8 items-center rounded-md text-xs',
              conversation.id === activeConversationId
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          "
        >
          <button
            type="button"
            class="flex h-full min-w-0 flex-1 items-center gap-1 truncate px-2 text-left"
            :title="conversationLabel(conversation)"
            :aria-pressed="conversation.id === activeConversationId"
            @click="emit('select', conversation.id)"
          >
            <Icon v-if="conversation.pinned" name="Pin" :size="12" class="shrink-0 opacity-70" />
            <span class="truncate">{{ conversationLabel(conversation) }}</span>
          </button>
          <Tooltip :title="t('multiAgent.deleteConversation')">
            <button
              type="button"
              :class="
                cn(
                  'mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm',
                  canDelete
                    ? 'hover:bg-muted-foreground/15 cursor-pointer'
                    : 'cursor-not-allowed opacity-35',
                  conversation.id === activeConversationId
                    ? 'opacity-70'
                    : 'opacity-0 group-hover:opacity-70 focus-visible:opacity-70',
                )
              "
              :disabled="!canDelete"
              @click.stop="requestDelete(conversation)"
            >
              <Icon name="Trash2" :size="12" />
            </button>
          </Tooltip>
        </div>
      </div>
    </ScrollArea>
  </aside>
</template>
