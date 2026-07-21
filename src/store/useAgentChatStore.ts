import { create } from "zustand";

import type { AgentChatMessage, AgentConversation } from "@/types/ai";

const EMPTY_CONVERSATIONS: readonly AgentConversation[] = [];

interface AgentChatState {
  conversationsByProjectId: Readonly<Record<string, readonly AgentConversation[]>>;
  activeConversationIdByProjectId: Readonly<Record<string, string>>;
  /** 从 SQLite 灌入某项目的会话列表（覆盖内存） */
  hydrateProject: (
    projectId: string,
    conversations: readonly AgentConversation[],
  ) => void;
  /** 删除 Git 项目后清理内存中的鲸灵会话 */
  clearProject: (projectId: string) => void;
  /** 清空全部项目的鲸灵会话（设置清理） */
  clearAllConversations: () => void;
  createConversation: (projectId: string, conversation: AgentConversation) => void;
  /** 项目尚无会话时原子地补一个，避免 Strict Mode 双 effect 建出两条 */
  ensureDefaultConversation: (projectId: string) => void;
  setActiveConversation: (projectId: string, conversationId: string) => void;
  deleteConversation: (projectId: string, conversationId: string) => void;
  renameConversation: (
    projectId: string,
    conversationId: string,
    title: string,
  ) => void;
  /** 置顶 / 取消置顶；置顶时移到列表最前 */
  setConversationPinned: (
    projectId: string,
    conversationId: string,
    pinned: boolean,
  ) => void;
  reorderConversations: (
    projectId: string,
    activeId: string,
    overId: string,
  ) => void;
  appendMessage: (projectId: string, conversationId: string, message: AgentChatMessage) => void;
  updateMessage: (
    projectId: string,
    conversationId: string,
    messageId: string,
    update: Partial<
      Pick<
        AgentChatMessage,
        | "content"
        | "isStreaming"
        | "createdAt"
        | "reasoningContent"
        | "reasoningDurationMs"
      >
    >,
  ) => void;
  removeMessage: (projectId: string, conversationId: string, messageId: string) => void;
  /** 保留 messageId 及之前的消息，删除其后全部 */
  truncateMessagesAfter: (
    projectId: string,
    conversationId: string,
    messageId: string,
  ) => void;
  /**
   * 编辑用户消息并截断其后：单次 set，避免只改文案却未删旧回复。
   * @returns 截断后的消息列表；未找到消息时返回 null
   */
  editUserMessageAndTruncate: (
    projectId: string,
    conversationId: string,
    messageId: string,
    content: string,
  ) => readonly AgentChatMessage[] | null;
}

/** 按项目隔离的多 Agent 会话；持久化由面板经 Chat Persist Service 写入 SQLite。 */
export const useAgentChatStore = create<AgentChatState>((set) => ({
  conversationsByProjectId: {},
  activeConversationIdByProjectId: {},

  hydrateProject(projectId, conversations) {
    set((state) => {
      const previousActive = state.activeConversationIdByProjectId[projectId];
      const nextActive =
        previousActive &&
        conversations.some((conversation) => conversation.id === previousActive)
          ? previousActive
          : conversations[0]?.id;
      const nextActiveByProject = { ...state.activeConversationIdByProjectId };
      if (nextActive) {
        nextActiveByProject[projectId] = nextActive;
      } else {
        delete nextActiveByProject[projectId];
      }
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: [...conversations],
        },
        activeConversationIdByProjectId: nextActiveByProject,
      };
    });
  },

  clearProject(projectId) {
    set((state) => {
      if (
        !(projectId in state.conversationsByProjectId) &&
        !(projectId in state.activeConversationIdByProjectId)
      ) {
        return state;
      }
      const nextConversations = { ...state.conversationsByProjectId };
      const nextActive = { ...state.activeConversationIdByProjectId };
      delete nextConversations[projectId];
      delete nextActive[projectId];
      return {
        conversationsByProjectId: nextConversations,
        activeConversationIdByProjectId: nextActive,
      };
    });
  },

  clearAllConversations() {
    set({
      conversationsByProjectId: {},
      activeConversationIdByProjectId: {},
    });
  },

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

  ensureDefaultConversation(projectId) {
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      if (conversations.length > 0) {
        const activeId = state.activeConversationIdByProjectId[projectId];
        if (activeId && conversations.some((item) => item.id === activeId)) {
          return state;
        }
        return {
          activeConversationIdByProjectId: {
            ...state.activeConversationIdByProjectId,
            [projectId]: conversations[0].id,
          },
        };
      }
      const conversation: AgentConversation = {
        id: `conversation-${projectId}-default`,
        title: "",
        messages: [],
      };
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: [conversation],
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

  renameConversation(projectId, conversationId, title) {
    const nextTitle = title.trim().slice(0, 48);
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      if (!conversations.some((conversation) => conversation.id === conversationId)) {
        return state;
      }
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: conversations.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, title: nextTitle }
              : conversation,
          ),
        },
      };
    });
  },

  setConversationPinned(projectId, conversationId, pinned) {
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      const index = conversations.findIndex(
        (conversation) => conversation.id === conversationId,
      );
      if (index < 0) {
        return state;
      }
      const current = conversations[index];
      if (!current) {
        return state;
      }
      // 已是目标状态，且置顶项已在最前时无需改动
      if (Boolean(current.pinned) === pinned && (!pinned || index === 0)) {
        return state;
      }
      const next = [...conversations];
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
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: next,
        },
      };
    });
  },

  reorderConversations(projectId, activeId, overId) {
    if (activeId === overId) {
      return;
    }
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      const from = conversations.findIndex((conversation) => conversation.id === activeId);
      const to = conversations.findIndex((conversation) => conversation.id === overId);
      if (from < 0 || to < 0) {
        return state;
      }
      const next = [...conversations];
      const [moved] = next.splice(from, 1);
      if (!moved) {
        return state;
      }
      next.splice(to, 0, moved);
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: next,
        },
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

  updateMessage(projectId, conversationId, messageId, update) {
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  messages: conversation.messages.map((message) =>
                    message.id === messageId ? { ...message, ...update } : message,
                  ),
                }
              : conversation,
          ),
        },
      };
    });
  },

  removeMessage(projectId, conversationId, messageId) {
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  messages: conversation.messages.filter((message) => message.id !== messageId),
                }
              : conversation,
          ),
        },
      };
    });
  },

  truncateMessagesAfter(projectId, conversationId, messageId) {
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: conversations.map((conversation) => {
            if (conversation.id !== conversationId) {
              return conversation;
            }
            const index = conversation.messages.findIndex(
              (message) => message.id === messageId,
            );
            if (index < 0) {
              return conversation;
            }
            return {
              ...conversation,
              messages: conversation.messages.slice(0, index + 1),
            };
          }),
        },
      };
    });
  },

  editUserMessageAndTruncate(projectId, conversationId, messageId, content) {
    let nextMessages: readonly AgentChatMessage[] | null = null;
    const createdAt = new Date().toISOString();
    set((state) => {
      const conversations = state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS;
      const target = conversations.find(
        (conversation) => conversation.id === conversationId,
      );
      if (!target) {
        return state;
      }
      const index = target.messages.findIndex((message) => message.id === messageId);
      if (index < 0 || target.messages[index]?.role !== "user") {
        return state;
      }
      nextMessages = target.messages.slice(0, index + 1).map((message, messageIndex) =>
        messageIndex === index
          ? { ...message, content, createdAt }
          : message,
      );
      return {
        conversationsByProjectId: {
          ...state.conversationsByProjectId,
          [projectId]: conversations.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, messages: nextMessages ?? conversation.messages }
              : conversation,
          ),
        },
      };
    });
    return nextMessages;
  },
}));

export { EMPTY_CONVERSATIONS };
