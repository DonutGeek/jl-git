<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";

import { useI18n } from "vue-i18n";

import { AgentComposer, AgentMessageList } from "@/components/Ai";
import MultiAgentSidebar from "./MultiAgentSidebar.vue";
import { Icon } from "@/components/Icon";
import AppWindowHeader from "@/layouts/page/AppWindowHeader.vue";
import { useAgentModel } from "@/hooks/core/useAgentModel";
import { useHasAgentApiKey } from "@/hooks/core/useHasAgentApiKey";
import { useMessage } from "@/hooks/web/useMessage";
import { listProjects, listWorkspaces } from "@/api/project";
import { deleteChatConversation, listChatConversations, upsertChatConversation } from "@/api/chat";
import {
  formatDeepSeekModelShortLabel,
  modelSupportsThinking,
  streamJinglingReply,
} from "@/services/ai";
import { buildAgentProfiles, prepareProfilesForAgentContext } from "@/services/agent/agent.profile";
import { useLocaleStore } from "@/store/modules/locale";
import {
  getActiveMultiAgentConversation,
  getMultiAgentMessages,
  useMultiAgentStore,
  useMultiAgentStoreWithOut,
} from "@/store/modules/multiAgent";
import { useSettingsDrawerStore } from "@/store/modules/setting";
import { toUserMessage } from "@/types/error";
import type { AgentChatMessage, AgentConversation } from "@/types/ai";
import { createAgentStreamBuffer } from "@/utils/agentStreamBuffer";

defineOptions({ name: "MultiAgentWorkspace" });

const EMPTY_MESSAGES: readonly AgentChatMessage[] = [];
const { t } = useI18n();
const message = useMessage();
const hasApiKey = useHasAgentApiKey();
const { models, modelId, setModelId, loading: modelsLoading } = useAgentModel();
const thinkingEnabled = ref(true);
const draft = ref("");
const replyingConversationId = ref<string | null>(null);
const messageSequence = ref(0);

let replySession: { conversationId: string; controller: AbortController } | null = null;

const multiAgentStore = useMultiAgentStore();
const { conversations, activeConversationId, profiles, profilesLoading, profilesError } =
  storeToRefs(multiAgentStore);
const { locale } = storeToRefs(useLocaleStore());
const settingsDrawerStore = useSettingsDrawerStore();

const activeConversation = computed(
  () =>
    conversations.value.find((item) => item.id === activeConversationId.value) ??
    conversations.value[0] ??
    null,
);
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
const headerHint = computed(() => {
  if (profilesLoading.value) {
    return t("multiAgent.scanning");
  }
  return t("multiAgent.projectCount", { count: profiles.value.length });
});

function abortReplySession(): void {
  replySession?.controller.abort();
}

function nextMessageId(): string {
  messageSequence.value += 1;
  return `resume-msg-${Date.now()}-${messageSequence.value}`;
}

async function persistConversation(conversation: AgentConversation): Promise<void> {
  try {
    await upsertChatConversation({
      scope: "agent_global",
      conversation,
    });
  } catch (error) {
    console.error(error);
    message.error(error);
  }
}

async function persistConversationById(conversationId: string): Promise<void> {
  const conversation = useMultiAgentStoreWithOut().conversations.find(
    (item) => item.id === conversationId,
  );
  if (conversation) {
    await persistConversation(conversation);
  }
}

function handleCreateConversation(): void {
  draft.value = "";
  const empty = conversations.value.find((item) => item.messages.length === 0);
  if (empty) {
    useMultiAgentStoreWithOut().setActiveConversation(empty.id);
    return;
  }
  const createdId = useMultiAgentStoreWithOut().createConversation();
  void persistConversationById(createdId);
}

async function handleDeleteConversation(conversationId: string): Promise<void> {
  const before = useMultiAgentStoreWithOut().conversations;
  if (before.length <= 1) {
    return;
  }
  if (replySession?.conversationId === conversationId) {
    abortReplySession();
  }
  useMultiAgentStoreWithOut().deleteConversation(conversationId);
  try {
    await deleteChatConversation(conversationId);
  } catch (error) {
    console.error(error);
    message.error(error);
  }
}

async function streamAssistantForHistory(
  conversationId: string,
  history: readonly AgentChatMessage[],
): Promise<void> {
  if (replySession) {
    replySession.controller.abort();
  }

  const assistantId = nextMessageId();
  useMultiAgentStoreWithOut().appendMessage(conversationId, {
    id: assistantId,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    isStreaming: true,
  });
  replyingConversationId.value = conversationId;

  const controller = new AbortController();
  replySession = { conversationId, controller };
  const store = useMultiAgentStoreWithOut();
  const buffer = createAgentStreamBuffer((content, reasoning) => {
    store.updateMessage(conversationId, assistantId, {
      content,
      ...(reasoning ? { reasoningContent: reasoning } : {}),
      isStreaming: true,
    });
  });

  try {
    const contextProfiles = prepareProfilesForAgentContext(profiles.value, []);
    await streamJinglingReply({
      host: "global",
      messages: history,
      profiles: contextProfiles,
      resumeAuthors: [],
      locale: locale.value,
      signal: controller.signal,
      model: modelId.value,
      enableThinking: thinkingSupported.value && thinkingEnabled.value,
      onReasoningDelta: buffer.onReasoningDelta,
      onDelta: buffer.onDelta,
    });
    buffer.finish();
    store.updateMessage(conversationId, assistantId, {
      isStreaming: false,
      createdAt: new Date().toISOString(),
      ...(buffer.reasoningDurationMs != null
        ? { reasoningDurationMs: buffer.reasoningDurationMs }
        : {}),
    });
  } catch (error) {
    buffer.finish();
    const current = getMultiAgentMessages(conversationId).find((item) => item.id === assistantId);
    const hasPartial = Boolean(current?.content.trim() || current?.reasoningContent?.trim());
    if (controller.signal.aborted) {
      if (hasPartial) {
        store.updateMessage(conversationId, assistantId, {
          isStreaming: false,
          createdAt: new Date().toISOString(),
          ...(buffer.reasoningDurationMs != null
            ? { reasoningDurationMs: buffer.reasoningDurationMs }
            : {}),
        });
      } else {
        store.removeMessage(conversationId, assistantId);
      }
    } else {
      store.removeMessage(conversationId, assistantId);
      message.error(error);
    }
  } finally {
    if (replySession?.controller === controller) {
      replySession = null;
      replyingConversationId.value = null;
    }
    void persistConversationById(conversationId);
  }
}

async function handleSubmit(): Promise<void> {
  const content = draft.value.trim();
  const conversationId = useMultiAgentStoreWithOut().activeConversationId;
  if (!content || !conversationId || isReplying.value || profilesLoading.value) {
    return;
  }
  if (!hasApiKey.value) {
    settingsDrawerStore.openDrawer("ai");
    return;
  }

  const userMessage: AgentChatMessage = {
    id: nextMessageId(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
  const history = [...getMultiAgentMessages(conversationId), userMessage];
  draft.value = "";
  useMultiAgentStoreWithOut().appendMessage(conversationId, userMessage);
  void persistConversationById(conversationId);
  await streamAssistantForHistory(conversationId, history);
}

onMounted(() => {
  let cancelled = false;
  let profilesActive = true;

  void (async () => {
    try {
      const list = await listChatConversations({ scope: "agent_global" });
      if (cancelled) {
        return;
      }
      if (list.length > 0) {
        useMultiAgentStoreWithOut().hydrateConversations(list);
        return;
      }
      useMultiAgentStoreWithOut().ensureDefaultConversation();
      const created = getActiveMultiAgentConversation();
      if (created && !cancelled) {
        await persistConversation(created);
      }
    } catch (error) {
      if (cancelled) {
        return;
      }
      console.error(error);
      useMultiAgentStoreWithOut().ensureDefaultConversation();
      message.error(error);
    }
  })();

  useMultiAgentStoreWithOut().setProfilesLoading(true);
  Promise.all([listProjects(), listWorkspaces()])
    .then(([projectList, workspaceList]) => buildAgentProfiles(projectList, [], workspaceList))
    .then((next) => {
      if (profilesActive) {
        useMultiAgentStoreWithOut().setProfiles(next);
      }
    })
    .catch((error: unknown) => {
      if (profilesActive) {
        useMultiAgentStoreWithOut().setProfiles(
          [],
          toUserMessage(error) || t("multiAgent.profileFailed"),
        );
      }
    });

  onUnmounted(() => {
    cancelled = true;
    profilesActive = false;
    abortReplySession();
  });
});
</script>

<template>
  <main class="bg-background text-foreground flex h-screen min-h-0 w-full flex-col overflow-hidden">
    <AppWindowHeader height-class-name="h-11" class-name="gap-2">
      <Icon name="Sparkles" :size="16" class="text-muted-foreground shrink-0" />
      <span class="truncate text-sm font-semibold">{{ t("multiAgent.windowTitle") }}</span>
      <span class="text-muted-foreground truncate text-xs">{{ headerHint }}</span>
    </AppWindowHeader>

    <p v-if="profilesError" class="text-destructive px-4 py-3 text-center text-sm">
      {{ profilesError }}
    </p>

    <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <MultiAgentSidebar
        :conversations="conversations"
        :active-conversation-id="activeConversationId"
        @select="
          (conversationId) => {
            draft = '';
            useMultiAgentStoreWithOut().setActiveConversation(conversationId);
          }
        "
        @create="handleCreateConversation"
        @delete="(conversationId) => void handleDeleteConversation(conversationId)"
      />
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div class="min-h-0 min-w-0 flex-1 overflow-hidden">
          <AgentMessageList
            :messages="messages"
            :conversation-id="activeConversationId ?? 'agent-global'"
            :actions-disabled="isReplying || profilesLoading || !hasApiKey"
            :empty-title="t('multiAgent.emptyState')"
            :empty-description="t('multiAgent.emptyStateDescription')"
          />
        </div>
        <AgentComposer
          :draft="draft"
          :is-replying="isReplying"
          :can-submit="!profilesLoading && Boolean(activeConversation)"
          :placeholder="t('multiAgent.inputPlaceholder')"
          :show-thinking-toggle="thinkingSupported"
          :thinking-enabled="thinkingEnabled"
          :show-model-picker="true"
          :model-options="modelOptions"
          :model-id="modelId"
          :model-loading="modelsLoading"
          @update:draft="(value) => (draft = value)"
          @update:thinking-enabled="(value) => (thinkingEnabled = value)"
          @update:model-id="setModelId"
          @submit="handleSubmit"
          @stop="abortReplySession"
        />
      </div>
    </div>
  </main>
</template>
