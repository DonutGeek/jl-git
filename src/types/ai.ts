export type AgentChatMessageRole = "assistant" | "user";

export interface AgentChatMessage {
  id: string;
  role: AgentChatMessageRole;
  content: string;
  /** ISO 时间：用户为提问时刻；助手为回复完成时刻 */
  createdAt: string;
  isStreaming?: boolean;
}

export interface AgentConversation {
  id: string;
  title: string;
  messages: readonly AgentChatMessage[];
}
