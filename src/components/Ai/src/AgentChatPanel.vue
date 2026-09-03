<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";

import { message } from "antdv-next";
import { useI18n } from "vue-i18n";

import AgentComposer from "./AgentComposer.vue";
import AgentConversationTabs from "./AgentConversationTabs.vue";
import AgentMessageList from "./AgentMessageList.vue";
import { useAgentModel } from "@/hooks/core/useAgentModel";
import { useHasAgentApiKey } from "@/hooks/core/useHasAgentApiKey";
import { useZustand } from "@/hooks/core/useZustand";
import {
  deleteChatConversation,
  formatDeepSeekModelShortLabel,
  listChatConversations,
  modelSupportsThinking,
  streamJinglingReply,
  upsertChatConversation,
} from "@/services/ai";
import { buildJlgitMeta } from "@/services/agent/agent.profile";
import {
  EMPTY_CONVERSATIONS,
  useAgentChatStore,
  useAgentChatStoreWithOut,
} from "@/store/modules/agentChat";
import { useLocaleStore } from "@/store/modules/locale";
import { useProjectStore } from "@/store/modules/project";
import { useSettingsDrawerStore } from "@/store/modules/setting";
import { toUserMessage } from "@/types/error";
import type { AgentChatMessage, AgentConversation } from "@/types/ai";
import { createAgentStreamBuffer } from "@/utils/agentStreamBuffer";

defineOptions({ name: "AgentChatPanel" });

const props = defineProps<{
  projectId: string;
  repoPath: string;
}>();

const EMPTY_MESSAGES: readonly AgentChatMessage[] = [];
const { t } = useI18n();
const hasApiKey = useHasAgentApiKey();
const { models, modelId, setModelId, loading: modelsLoading } = useAgentModel();
const thinkingEnabled = ref(true);
const draft = ref("");
const replyingConversationId = ref<string | null>(null);
const messageSequence = ref(0);
const conversationSequence = ref(0);

let replySession: { conversationId: string; controller: AbortController } | null = null;

const conversationsByProjectId = useZustand(
  useAgentChatStore,
  (state) => state.conversationsByProjectId,
);
const activeConversationIdByProjectId = useZustand(
  useAgentChatStore,
  (state) => state.activeConversationIdByProjectId,
);
const projects = useZustand(useProjectStore, (state) => state.projects);
const workspaces = useZustand(useProjectStore, (state) => state.workspaces);
const { locale } = storeToRefs(useLocaleStore());
const settingsDrawerStore = useSettingsDrawerStore();

const conversations = computed(
  () => conversationsByProjectId.value[props.projectId] ?? EMPTY_CONVERSATIONS,
);
const activeConversation = computed(() => {
  const activeId = activeConversationIdByProjectId.value[props.projectId];
  return (
    conversations.value.find((conversation) => conversation.id === activeId) ??
    conversations.value[0] ??
    null
  );
});
const messages = computed(() => activeConversation.value?.messages ?? EMPTY_MESSAGES);
const isReplying = computed(
  () =>
    replyingConversationId.value != null &&
    replyingConversationId.value === activeConversation.value?.id,
);
const thinkingSupported = computed(() => modelSupportsThinking(modelId.value));
const modelOptions = computed(() =>
  models.value.map((model) => ({
    value: model.id,
    label: formatDeepSeekModelShortLabel(model.id),
  })),
);
const jlgitMeta = computed(() => {
  const project = projects.value.find((item) => item.id === props.projectId);
  if (!project) {
    return undefined;
  }
  const groupNameById = new Map(
    workspaces.value.map((workspace) => [workspace.id, workspace.name]),
  );
  return buildJlgitMeta(project, groupNameById);
});

function abortReplySession(): void {
  replySession?.controller.abort();
}

function nextMessageId(prefix: "user" | "assistant"): string {
  messageSequence.value += 1;
  return `${prefix}-${Date.now()}-${messageSequence.value}`;
}

async function persistConversation(conversation: AgentConversation): Promise<void> {
  try {
    await upsertChatConversation({
      scope: "agent",
      projectId: props.projectId,
      conversation,
    });
  } catch (error) {
    console.error(error);
    message.error(toUserMessage(error) || t("agent.replyFailed"));
  }
}

async function persistActiveConversation(conversationId: string): Promise<void> {
  const conversation = useAgentChatStoreWithOut().conversationsByProjectId[props.projectId]?.find(
    (item) => item.id === conversationId,
  );
  if (conversation) {
    await persistConversation(conversation);
  }
}

function handleCreateConversation(): void {
  const emptyConversation = conversations.value.find((item) => item.messages.length === 0);
  if (emptyConversation) {
    if (emptyConversation.id !== activeConversation.value?.id) {
      useAgentChatStoreWithOut().setActiveConversation(props.projectId, emptyConversation.id);
      draft.value = "";
    }
    return;
  }
  conversationSequence.value += 1;
  const created: AgentConversation = {
    id: `conversation-${Date.now()}-${conversationSequence.value}`,
    title: "",
    messages: [],
  };
  useAgentChatStoreWithOut().createConversation(props.projectId, created);
  void persistConversation(created);
  draft.value = "";
}

async function handleDeleteConversation(conversationId: string): Promise<void> {
  const before = useAgentChatStoreWithOut().conversationsByProjectId[props.projectId] ?? [];
  if (before.length <= 1) {
    return;
  }
  if (replySession?.conversationId === conversationId) {
    abortReplySession();
  }
  useAgentChatStoreWithOut().deleteConversation(props.projectId, conversationId);
  try {
    await deleteChatConversation(conversationId);
  } catch (error) {
    console.error(error);
    message.error(toUserMessage(error) || t("agent.replyFailed"));
  }
}

async function streamAssistantForHistory(
  conversationId: string,
  historyForRequest: readonly AgentChatMessage[],
): Promise<void> {
  if (replySession) {
    replySession.controller.abort();
  }

  const askedAt = new Date().toISOString();
  const assistantMessage: AgentChatMessage = {
    id: nextMessageId("assistant"),
    role: "assistant",
    content: "",
    createdAt: askedAt,
    isStreaming: true,
  };
  useAgentChatStoreWithOut().appendMessage(props.projectId, conversationId, assistantMessage);
  replyingConversationId.value = conversationId;

  const controller = new AbortController();
  replySession = { conversationId, controller };
  const store = useAgentChatStoreWithOut();
  const buffer = createAgentStreamBuffer((content, reasoning) => {
    store.updateMessage(props.projectId, conversationId, assistantMessage.id, {
      content,
      ...(reasoning ? { reasoningContent: reasoning } : {}),
    });
  });

  try {
    await streamJinglingReply({
      host: "project",
      messages: historyForRequest,
      repoPath: props.repoPath,
      locale: locale.value,
      jlgitMeta: jlgitMeta.value,
      model: modelId.value,
      enableThinking: thinkingSupported.value && thinkingEnabled.value,
      signal: controller.signal,
      onReasoningDelta: buffer.onReasoningDelta,
      onDelta: buffer.onDelta,
    });
    buffer.finish();
    store.updateMessage(props.projectId, conversationId, assistantMessage.id, {
      isStreaming: false,
      createdAt: new Date().toISOString(),
      ...(buffer.reasoningDurationMs != null
        ? { reasoningDurationMs: buffer.reasoningDurationMs }
        : {}),
    });
    await persistActiveConversation(conversationId);
  } catch (error) {
    buffer.finish();
    if (buffer.contentBuffer || buffer.reasoningBuffer) {
      store.updateMessage(props.projectId, conversationId, assistantMessage.id, {
        isStreaming: false,
        createdAt: new Date().toISOString(),
        ...(buffer.reasoningDurationMs != null
          ? { reasoningDurationMs: buffer.reasoningDurationMs }
          : {}),
      });
      await persistActiveConversation(conversationId);
    } else {
      store.removeMessage(props.projectId, conversationId, assistantMessage.id);
      await persistActiveConversation(conversationId);
    }
    if (!controller.signal.aborted) {
      message.error(toUserMessage(error) || t("agent.replyFailed"));
    }
  } finally {
    if (replySession?.controller === controller) {
      replySession = null;
      replyingConversationId.value = null;
    }
  }
}

async function handleSubmit(): Promise<void> {
  const content = draft.value.trim();
  const active = activeConversation.value;
  if (!content || !active || isReplying.value) {
    return;
  }
  if (!hasApiKey.value) {
    settingsDrawerStore.openDrawer("ai");
    return;
  }

  const userMessage: AgentChatMessage = {
    id: nextMessageId("user"),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
  const conversationId = active.id;
  const historyForRequest = [...messages.value, userMessage];
  useAgentChatStoreWithOut().appendMessage(props.projectId, conversationId, userMessage);
  draft.value = "";
  void persistActiveConversation(conversationId);
  await streamAssistantForHistory(conversationId, historyForRequest);
}

watch(
  () => props.projectId,
  (projectId, _previous, onCleanup) => {
    abortReplySession();
    let cancelled = false;
    void (async () => {
      try {
        const list = await listChatConversations({
          scope: "agent",
          projectId,
        });
        if (cancelled) {
          return;
        }
        if (list.length > 0) {
          useAgentChatStoreWithOut().hydrateProject(projectId, list);
          return;
        }
        useAgentChatStoreWithOut().ensureDefaultConversation(projectId);
        const created = useAgentChatStoreWithOut().conversationsByProjectId[projectId]?.[0];
        if (created && !cancelled) {
          await persistConversation(created);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(error);
        useAgentChatStoreWithOut().ensureDefaultConversation(projectId);
        message.error(toUserMessage(error) || t("agent.replyFailed"));
      }
    })();
    onCleanup(() => {
      cancelled = true;
    });
  },
  { immediate: true },
);

onUnmounted(() => {
  abortReplySession();
});
</script>

<template>
  <section
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    :aria-label="t('agent.title')"
  >
    <AgentConversationTabs
      :conversations="conversations"
      :active-conversation-id="activeConversation?.id"
      @select="
        (conversationId) =>
          useAgentChatStoreWithOut().setActiveConversation(projectId, conversationId)
      "
      @create="handleCreateConversation"
      @delete="(conversationId) => void handleDeleteConversation(conversationId)"
    />
    <div class="min-h-0 min-w-0 flex-1 overflow-hidden">
      <AgentMessageList
        :messages="messages"
        :conversation-id="activeConversation?.id"
        :actions-disabled="isReplying || !hasApiKey"
      />
    </div>
    <AgentComposer
      :draft="draft"
      :is-replying="isReplying"
      :can-submit="Boolean(activeConversation)"
      :show-thinking-toggle="thinkingSupported"
      :thinking-enabled="thinkingEnabled"
      :show-model-picker="true"
      :model-options="modelOptions"
      :model-id="modelId"
      :model-loading="modelsLoading"
      @update:draft="(value) => (draft = value)"
      @update:thinking-enabled="(value) => (thinkingEnabled = value)"
      @update:model-id="setModelId"
      @submit="void handleSubmit()"
      @stop="abortReplySession"
    />
  </section>
</template>
