export type AgentChatMessageRole = "assistant" | "user";

export interface AgentChatMessage {
  id: string;
  role: AgentChatMessageRole;
  content: string;
}

export interface AgentConversation {
  id: string;
  title: string;
  messages: readonly AgentChatMessage[];
}
