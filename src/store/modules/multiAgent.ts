import { defineStore } from "pinia";

import { applyStorePatch } from "@/store/applyStorePatch";
import { store } from "@/store";

import { emptyAgentIdentity } from "@/services/agent/agent.identity";
import type { AgentChatMessage, AgentConversation } from "@/types/ai";
import type { AgentIdentity, AgentProjectProfile } from "@/types/agent";

function createEmptyConversation(): AgentConversation {
  return {
    id: `resume-conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    messages: [],
  };
}

function mapConversationById(
  conversations: readonly AgentConversation[],
  conversationId: string,
  map: (conversation: AgentConversation) => AgentConversation,
): AgentConversation[] | null {
  const index = conversations.findIndex((conversation) => conversation.id === conversationId);
  if (index < 0) {
    return null;
  }
  const current = conversations[index];
  if (!current) {
    return null;
  }
  const next = [...conversations];
  next[index] = map(current);
  return next;
}

interface MultiAgentState {
  profiles: AgentProjectProfile[];
  profilesLoading: boolean;
  profilesError: string | null;
  conversations: readonly AgentConversation[];
  activeConversationId: string | null;
  identity: AgentIdentity;
  identityReady: boolean;
  setProfilesLoading: (loading: boolean) => void;
  setProfiles: (profiles: AgentProjectProfile[], error?: string | null) => void;
  setIdentity: (identity: AgentIdentity) => void;
  patchIdentity: (patch: Partial<AgentIdentity>) => void;
  /** 从 SQLite 灌入会话列表（覆盖内存） */
  hydrateConversations: (conversations: readonly AgentConversation[]) => void;
  /** 清空全部多仓鲸灵会话（设置清理） */
  clearAllConversations: () => void;
  ensureDefaultConversation: () => void;
  createConversation: () => string;
  setActiveConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  renameConversation: (conversationId: string, title: string) => void;
  setConversationPinned: (conversationId: string, pinned: boolean) => void;
  reorderConversations: (activeId: string, overId: string) => void;
  appendMessage: (conversationId: string, message: AgentChatMessage) => void;
  updateMessage: (
    conversationId: string,
    messageId: string,
    patch: Partial<AgentChatMessage>,
  ) => void;
  removeMessage: (conversationId: string, messageId: string) => void;
  truncateMessagesAfter: (conversationId: string, messageId: string) => void;
  editUserMessageAndTruncate: (
    conversationId: string,
    messageId: string,
    content: string,
  ) => readonly AgentChatMessage[] | null;
  /** @deprecated 使用 delete / create；清空指定会话消息 */
  resetConversation: (conversationId: string) => void;
}

export const useMultiAgentStore = defineStore("multiAgent", {
  state: (): Pick<
    MultiAgentState,
    | "profiles"
    | "profilesLoading"
    | "profilesError"
    | "conversations"
    | "activeConversationId"
    | "identity"
    | "identityReady"
  > => ({
    profiles: [],
    profilesLoading: false,
    profilesError: null,
    conversations: [],
    activeConversationId: null,
    identity: emptyAgentIdentity(),
    identityReady: false,
  }),
  actions: {
    setProfilesLoading(loading: boolean) {
      this.$patch({ profilesLoading: loading });
    },

    setProfiles(profiles: AgentProjectProfile[], error: string | null = null) {
      this.$patch({ profiles, profilesError: error, profilesLoading: false });
    },

    setIdentity(identity: AgentIdentity) {
      this.$patch({ identity, identityReady: true });
    },

    patchIdentity(patch: Partial<AgentIdentity>) {
      applyStorePatch(this, (state) => ({
        identity: {
          displayName: patch.displayName?.trim() ?? state.identity.displayName,
          phone: patch.phone?.trim() ?? state.identity.phone,
          email: patch.email?.trim() ?? state.identity.email,
        },
      }));
    },

    hydrateConversations(conversations: readonly AgentConversation[]) {
      applyStorePatch(this, (state) => {
        const previousActive = state.activeConversationId;
        const nextActive =
          previousActive && conversations.some((conversation) => conversation.id === previousActive)
            ? previousActive
            : (conversations[0]?.id ?? null);
        return {
          conversations: [...conversations],
          activeConversationId: nextActive,
        };
      });
    },

    clearAllConversations() {
      this.$patch({
        conversations: [],
        activeConversationId: null,
      });
    },

    ensureDefaultConversation() {
      applyStorePatch(this, (state) => {
        if (state.conversations.length > 0) {
          const activeId = state.activeConversationId;
          if (activeId && state.conversations.some((item) => item.id === activeId)) {
            return state;
          }
          return { activeConversationId: state.conversations[0].id };
        }
        const conversation = createEmptyConversation();
        return {
          conversations: [conversation],
          activeConversationId: conversation.id,
        };
      });
    },

    createConversation() {
      const conversation = createEmptyConversation();
      applyStorePatch(this, (state) => ({
        conversations: [...state.conversations, conversation],
        activeConversationId: conversation.id,
      }));
      return conversation.id;
    },

    setActiveConversation(conversationId: string) {
      applyStorePatch(this, (state) => {
        if (
          state.activeConversationId === conversationId ||
          !state.conversations.some((item) => item.id === conversationId)
        ) {
          return state;
        }
        return { activeConversationId: conversationId };
      });
    },

    deleteConversation(conversationId: string) {
      applyStorePatch(this, (state) => {
        const index = state.conversations.findIndex(
          (conversation) => conversation.id === conversationId,
        );
        if (index < 0 || state.conversations.length <= 1) {
          return state;
        }
        const nextConversations = state.conversations.filter(
          (conversation) => conversation.id !== conversationId,
        );
        const nextActive =
          state.activeConversationId === conversationId
            ? ((nextConversations[index] ?? nextConversations[index - 1])?.id ?? null)
            : state.activeConversationId;
        return {
          conversations: nextConversations,
          activeConversationId: nextActive,
        };
      });
    },

    renameConversation(conversationId: string, title: string) {
      const nextTitle = title.trim().slice(0, 48);
      applyStorePatch(this, (state) => ({
        conversations: state.conversations.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, title: nextTitle } : conversation,
        ),
      }));
    },

    setConversationPinned(conversationId: string, pinned: boolean) {
      applyStorePatch(this, (state) => {
        const index = state.conversations.findIndex(
          (conversation) => conversation.id === conversationId,
        );
        if (index < 0) {
          return state;
        }
        const current = state.conversations[index];
        if (!current) {
          return state;
        }
        if (Boolean(current.pinned) === pinned && (!pinned || index === 0)) {
          return state;
        }
        const next = [...state.conversations];
        next.splice(index, 1);
        const updated: AgentConversation = { ...current, pinned };
        if (pinned) {
          next.unshift(updated);
        } else {
          const insertAt = next.findIndex((item) => !item.pinned);
          if (insertAt < 0) {
            next.push(updated);
          } else {
            next.splice(insertAt, 0, updated);
          }
        }
        return { conversations: next };
      });
    },

    reorderConversations(activeId: string, overId: string) {
      if (activeId === overId) {
        return;
      }
      applyStorePatch(this, (state) => {
        const from = state.conversations.findIndex((item) => item.id === activeId);
        const to = state.conversations.findIndex((item) => item.id === overId);
        if (from < 0 || to < 0) {
          return state;
        }
        const next = [...state.conversations];
        const [moved] = next.splice(from, 1);
        if (!moved) {
          return state;
        }
        next.splice(to, 0, moved);
        return { conversations: next };
      });
    },

    appendMessage(conversationId: string, message: AgentChatMessage) {
      applyStorePatch(this, (state) => {
        const conversations = mapConversationById(
          state.conversations,
          conversationId,
          (conversation) => {
            const nextTitle =
              conversation.title || message.role !== "user"
                ? conversation.title
                : (message.content.split(/\r?\n/, 1)[0]?.trim().slice(0, 24) ?? "");
            return {
              ...conversation,
              title: nextTitle,
              messages: [...conversation.messages, message],
            };
          },
        );
        return conversations ? { conversations } : state;
      });
    },

    updateMessage(conversationId: string, messageId: string, patch: Partial<AgentChatMessage>) {
      applyStorePatch(this, (state) => {
        const conversations = mapConversationById(
          state.conversations,
          conversationId,
          (conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === messageId ? { ...message, ...patch } : message,
            ),
          }),
        );
        return conversations ? { conversations } : state;
      });
    },

    removeMessage(conversationId: string, messageId: string) {
      applyStorePatch(this, (state) => {
        const conversations = mapConversationById(
          state.conversations,
          conversationId,
          (conversation) => ({
            ...conversation,
            messages: conversation.messages.filter((message) => message.id !== messageId),
          }),
        );
        return conversations ? { conversations } : state;
      });
    },

    truncateMessagesAfter(conversationId: string, messageId: string) {
      applyStorePatch(this, (state) => {
        const conversations = mapConversationById(
          state.conversations,
          conversationId,
          (conversation) => {
            const index = conversation.messages.findIndex((message) => message.id === messageId);
            if (index < 0) {
              return conversation;
            }
            return {
              ...conversation,
              messages: conversation.messages.slice(0, index + 1),
            };
          },
        );
        return conversations ? { conversations } : state;
      });
    },

    editUserMessageAndTruncate(conversationId: string, messageId: string, content: string) {
      let nextMessages: AgentChatMessage[] | null = null;
      const createdAt = new Date().toISOString();
      applyStorePatch(this, (state) => {
        const conversations = mapConversationById(
          state.conversations,
          conversationId,
          (conversation) => {
            const index = conversation.messages.findIndex((message) => message.id === messageId);
            if (index < 0 || conversation.messages[index]?.role !== "user") {
              return conversation;
            }
            nextMessages = conversation.messages
              .slice(0, index + 1)
              .map((message, messageIndex) =>
                messageIndex === index ? { ...message, content, createdAt } : message,
              );
            return {
              ...conversation,
              messages: nextMessages,
            };
          },
        );
        return conversations ? { conversations } : state;
      });
      return nextMessages;
    },

    resetConversation(conversationId: string) {
      applyStorePatch(this, (state) => {
        const conversations = mapConversationById(
          state.conversations,
          conversationId,
          (conversation) => ({
            ...conversation,
            messages: [],
            title: "",
          }),
        );
        return conversations ? { conversations } : state;
      });
    },
  },
});

export function useMultiAgentStoreWithOut() {
  return useMultiAgentStore(store);
}

/** 读取指定会话消息（供流式回调等非 React 路径；勿依赖「当前激活」） */
export function getMultiAgentMessages(conversationId: string): readonly AgentChatMessage[] {
  const conversation = useMultiAgentStoreWithOut().conversations.find(
    (item) => item.id === conversationId,
  );
  return conversation?.messages ?? [];
}

/** @deprecated 使用 getMultiAgentMessages(activeId) */
export function getActiveMultiAgentMessages(): readonly AgentChatMessage[] {
  const state = useMultiAgentStoreWithOut();
  if (!state.activeConversationId) {
    return [];
  }
  return getMultiAgentMessages(state.activeConversationId);
}

export function getActiveMultiAgentConversation(): AgentConversation | null {
  const state = useMultiAgentStoreWithOut();
  return state.conversations.find((item) => item.id === state.activeConversationId) ?? null;
}
