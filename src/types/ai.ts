export type AgentChatMessageRole = "assistant" | "user";

export type AgentMentionKind = "branch" | "plugin" | "project";

export interface AgentBranchMention {
  type: "branch";
  name: string;
}

export interface AgentPluginMention {
  type: "plugin";
  id: string;
  name: string;
}

export interface AgentProjectMention {
  type: "project";
  id: string;
  name: string;
}

export type AgentMention =
  | AgentBranchMention
  | AgentPluginMention
  | AgentProjectMention;

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
  /** 候选菜单选中的提及（分支 / 插件 / 项目），供上下文解析使用 */
  mentions?: readonly AgentMention[];
}

export interface AgentConversation {
  id: string;
  title: string;
  messages: readonly AgentChatMessage[];
  /** 置顶会话（视觉标记；置顶操作会移到列表最前） */
  pinned?: boolean;
}
