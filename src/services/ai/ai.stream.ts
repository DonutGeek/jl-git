import { streamAgentReply } from "@/services/ai/ai.agent";
import { streamMultiAgentReply } from "@/services/ai/ai.multi";
import type { AgentChatMessage } from "@/types/ai";
import type { AgentProjectProfile } from "@/types/agent";

interface StreamJinglingProjectOptions {
  host: "project";
  messages: readonly AgentChatMessage[];
  repoPath: string;
  locale: string;
  signal?: AbortSignal;
  model?: string;
  enableThinking?: boolean;
  onDelta: (content: string) => void;
  onReasoningDelta?: (content: string) => void;
}

interface StreamJinglingGlobalOptions {
  host: "global";
  messages: readonly AgentChatMessage[];
  profiles: readonly AgentProjectProfile[];
  /** 仅简历技能使用：用户在对话中主动声明的 Git 作者身份 */
  resumeAuthors: ReadonlyArray<{ name: string; email: string }>;
  locale: string;
  signal?: AbortSignal;
  model?: string;
  enableThinking?: boolean;
  onDelta: (content: string) => void;
  onReasoningDelta?: (content: string) => void;
}

export type StreamJinglingReplyOptions =
  | StreamJinglingProjectOptions
  | StreamJinglingGlobalOptions;

/**
 * 统一鲸灵流式入口：按 AgentHost 分发到单仓 / 多仓实现。
 * 单仓与多仓共用此 API，便于后续继续收敛 prompt / 工具面。
 */
export async function streamJinglingReply(
  options: StreamJinglingReplyOptions,
): Promise<void> {
  if (options.host === "global") {
    await streamMultiAgentReply({
      messages: options.messages,
      profiles: options.profiles,
      resumeAuthors: options.resumeAuthors,
      locale: options.locale,
      signal: options.signal,
      model: options.model,
      enableThinking: options.enableThinking,
      onDelta: options.onDelta,
      onReasoningDelta: options.onReasoningDelta,
    });
    return;
  }

  await streamAgentReply({
    messages: options.messages,
    repoPath: options.repoPath,
    locale: options.locale,
    signal: options.signal,
    model: options.model,
    enableThinking: options.enableThinking,
    onDelta: options.onDelta,
    onReasoningDelta: options.onReasoningDelta,
  });
}
