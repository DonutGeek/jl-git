import { invokeCommand } from "@/services/invoke";
import type { AgentChatMessage, AgentConversation, AgentMention } from "@/types/ai";
import { isRecord } from "@/types/error";

export type ChatScope = "agent" | "agent_global";

interface PersistedChatMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  reasoningContent?: string | null;
  reasoningDurationMs?: number | null;
  mentionsJson?: string | null;
}

interface PersistedChatConversation {
  id: string;
  scope: string;
  projectId?: string | null;
  title: string;
  pinned: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  messages: PersistedChatMessage[];
}

function mentionsToJson(
  mentions: readonly AgentMention[] | undefined,
): string | null {
  if (!mentions || mentions.length === 0) {
    return null;
  }
  return JSON.stringify(mentions);
}

function mentionsFromJson(
  value: string | null | undefined,
): readonly AgentMention[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const mentions: AgentMention[] = [];
    for (const item of parsed) {
      if (!isRecord(item) || typeof item.name !== "string") {
        continue;
      }
      if (item.type === "branch") {
        mentions.push({ type: "branch", name: item.name });
        continue;
      }
      if (
        (item.type === "plugin" || item.type === "project") &&
        typeof item.id === "string" &&
        item.id.trim()
      ) {
        mentions.push({
          type: item.type,
          id: item.id,
          name: item.name,
        });
      }
    }
    return mentions.length > 0 ? mentions : undefined;
  } catch {
    return undefined;
  }
}

function toAgentMessage(row: PersistedChatMessage): AgentChatMessage {
  const mentions = mentionsFromJson(row.mentionsJson);
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    createdAt: row.createdAt,
    ...(row.reasoningContent
      ? { reasoningContent: row.reasoningContent }
      : {}),
    ...(row.reasoningDurationMs != null
      ? { reasoningDurationMs: row.reasoningDurationMs }
      : {}),
    ...(mentions ? { mentions } : {}),
  };
}

function toAgentConversation(row: PersistedChatConversation): AgentConversation {
  return {
    id: row.id,
    title: row.title,
    pinned: row.pinned,
    messages: row.messages.map(toAgentMessage),
  };
}

function toPersistMessage(message: AgentChatMessage): PersistedChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    reasoningContent: message.reasoningContent ?? null,
    reasoningDurationMs: message.reasoningDurationMs ?? null,
    mentionsJson: mentionsToJson(message.mentions),
  };
}

/** 列出某范围下的会话（含消息与 reasoning） */
export async function listChatConversations(options: {
  scope: ChatScope;
  projectId?: string;
}): Promise<AgentConversation[]> {
  const result = await invokeCommand<{ conversations: PersistedChatConversation[] }>(
    "chat_list_conversations",
    {
      scope: options.scope,
      projectId: options.projectId,
    },
  );
  return result.conversations.map(toAgentConversation);
}

/** 整会话 upsert（替换该会话全部消息） */
export async function upsertChatConversation(options: {
  scope: ChatScope;
  projectId?: string;
  conversation: AgentConversation;
}): Promise<AgentConversation> {
  const now = new Date().toISOString();
  const result = await invokeCommand<{ conversation: PersistedChatConversation }>(
    "chat_upsert_conversation",
    {
      input: {
        scope: options.scope,
        projectId: options.projectId ?? null,
        conversation: {
          id: options.conversation.id,
          title: options.conversation.title,
          pinned: Boolean(options.conversation.pinned),
          createdAt: now,
          updatedAt: now,
          messages: options.conversation.messages
            .filter((message) => !message.isStreaming)
            .map(toPersistMessage),
        },
      },
    },
  );
  return toAgentConversation(result.conversation);
}

export async function deleteChatConversation(id: string): Promise<void> {
  await invokeCommand<{ ok: boolean }>("chat_delete_conversation", { id });
}

export async function reorderChatConversations(options: {
  scope: ChatScope;
  projectId?: string;
  orderedIds: readonly string[];
}): Promise<void> {
  await invokeCommand<{ ok: boolean }>("chat_reorder_conversations", {
    input: {
      scope: options.scope,
      projectId: options.projectId ?? null,
      orderedIds: [...options.orderedIds],
    },
  });
}
