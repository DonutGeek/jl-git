import { create } from "zustand";

import type { AgentChatMessage, AgentConversation } from "@/types/ai";

const EMPTY_CONVERSATIONS: readonly AgentConversation[] = [];

interface AgentChatState {
  conversationsByProjectId: Readonly<Record<string, readonly AgentConversation[]>>;
  activeConversationIdByProjectId: Readonly<Record<string, string>>;
  createConversation: (projectId: string, conversation: AgentConversation) => void;
  setActiveConversation: (projectId: string, conversationId: string) => void;
  deleteConversation: (projectId: string, conversationId: string) => void;
  appendMessage: (projectId: string, conversationId: string, message: AgentChatMessage) => void;
}

/** 按项目隔离的多 Agent 会话；仅在当前应用会话中保留，避免写入通用设置。 */
export const useAgentChatStore = create<AgentChatState>((set) => ({
  conversationsByProjectId: {},
  activeConversationIdByProjectId: {},

  createConversation(projectId, conversation) {
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      if (conversations.some((item) => item.id === conversation.id)) {
        return state;
      }
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: [...conversations, conversation],
        },
        activeConversationIdByProjectId: {
          ...state.activeConversationIdByProjectId,
          [projectId]: conversation.id,
        },
      };
    });
  },

  setActiveConversation(projectId, conversationId) {
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      if (
        state.activeConversationIdByProjectId[projectId] === conversationId ||
        !conversations.some((conversation) => conversation.id === conversationId)
      ) {
        return state;
      }
      return {
        activeConversationIdByProjectId: {
          ...state.activeConversationIdByProjectId,
          [projectId]: conversationId,
        },
      };
    });
  },

  deleteConversation(projectId, conversationId) {
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      const index = conversations.findIndex((conversation) => conversation.id === conversationId);
      if (index < 0 || conversations.length <= 1) {
        return state;
      }
      const nextConversations = conversations.filter((conversation) => conversation.id !== conversationId);
      const activeConversationId = state.activeConversationIdByProjectId[projectId];
      const nextActiveConversationId =
        activeConversationId === conversationId
          ? (nextConversations[index] ?? nextConversations[index - 1])?.id
          : activeConversationId;
      const nextActiveByProject = { ...state.activeConversationIdByProjectId };
      if (nextActiveConversationId) {
        nextActiveByProject[projectId] = nextActiveConversationId;
      } else {
        delete nextActiveByProject[projectId];
      }
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: nextConversations,
        },
        activeConversationIdByProjectId: nextActiveByProject,
      };
    });
  },

  appendMessage(projectId, conversationId, message) {
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      const current = conversations.find((conversation) => conversation.id === conversationId);
      if (!current) {
        return state;
      }
      const nextTitle =
        current.title || message.role !== "user"
          ? current.title
          : message.content.split(/\r?\n/, 1)[0]?.trim().slice(0, 24) ?? "";
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: conversations.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, title: nextTitle, messages: [...conversation.messages, message] }
              : conversation,
          ),
        },
      };
    });
  },
}));

export { EMPTY_CONVERSATIONS };
