<script setup lang="ts">
import { computed, ref } from "vue";

import { Button, Modal, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { ScrollArea } from "@/components/ScrollArea";
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
const pendingDelete = ref<AgentConversation | null>(null);
const canDelete = computed(() => props.conversations.length > 1);

function conversationLabel(conversation: AgentConversation): string {
  return conversation.title || t("multiAgent.newConversation");
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
  <aside
    class="border-border bg-muted/20 flex w-48 shrink-0 flex-col border-r"
    :aria-label="t('multiAgent.sidebarAria')"
  >
    <div class="shrink-0 p-2">
      <Tooltip :title="t('multiAgent.createConversation')" placement="right">
        <Button
          size="small"
          class="h-8 w-full justify-start gap-1.5 text-xs"
          :aria-label="t('multiAgent.createConversation')"
          @click="emit('create')"
        >
          <Icon name="SquarePen" :size="14" />
          {{ t("multiAgent.createConversation") }}
        </Button>
      </Tooltip>
    </div>
    <ScrollArea class="min-h-0 flex-1">
      <div class="flex flex-col gap-0.5 px-2 pb-2" :aria-label="t('multiAgent.conversationsAria')">
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
              :aria-label="t('multiAgent.deleteConversation')"
              :disabled="!canDelete"
              @click.stop="requestDelete(conversation)"
            >
              <Icon name="Trash2" :size="12" />
            </button>
          </Tooltip>
        </div>
      </div>
    </ScrollArea>
    <Modal
      :open="Boolean(pendingDelete)"
      :title="t('multiAgent.deleteConversationTitle')"
      :ok-text="t('multiAgent.deleteConversation')"
      :cancel-text="t('common.cancel')"
      ok-type="danger"
      @update:open="(open: boolean) => !open && (pendingDelete = null)"
      @ok="confirmDelete"
    >
      <p class="text-sm">
        {{
          t("multiAgent.deleteConversationConfirm", {
            name: pendingDelete ? conversationLabel(pendingDelete) : "",
          })
        }}
      </p>
    </Modal>
  </aside>
</template>
