export type AgentChatMessageRole = "assistant" | "user";

export interface AgentBranchMention {
  type: "branch";
  name: string;
}

export interface AgentChatMessage {
  id: string;
  role: AgentChatMessageRole;
  content: string;
  /** ISO 时间：用户为提问时刻；助手为回复完成时刻 */
  createdAt: string;
  isStreaming?: boolean;
  /** DeepSeek thinking 模式的推理过程（仅展示，不回传 API） */
  reasoningContent?: string;
  /** 深度思考用时（毫秒），思考结束后写入 */
  reasoningDurationMs?: number;
  /** 仅候选菜单选中的分支会写入此处，供 AI 作为可信引用使用。 */
  mentions?: readonly AgentBranchMention[];
}

export interface AgentConversation {
  id: string;
  title: string;
  messages: readonly AgentChatMessage[];
}
