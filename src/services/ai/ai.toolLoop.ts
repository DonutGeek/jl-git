import { postDeepSeekChatStream } from "@/api/deepseek";
import { mapDeepSeekApiError } from "@/services/ai/ai.httpError";
import { AGENT_CODE_TOOL_MAX_ROUNDS } from "@/services/agent/agent.codePolicy";
import {
  buildAgentCodeToolDefinitions,
  executeAgentCodeTool,
  type AgentCodeToolRepo,
  type AgentToolCall,
  type AgentToolDefinition,
} from "@/services/ai/ai.tools";
import { redactSecrets } from "@/services/ai/ai.sanitize";
import { isRecord } from "@/types/error";

type ChatRole = "system" | "user" | "assistant" | "tool";

interface ChatMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: AgentToolCall[];
  tool_call_id?: string;
}

interface RunAgentToolLoopOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  /** 已脱敏的 user/assistant 历史（不含 system） */
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  allowedRepos: readonly AgentCodeToolRepo[];
  multiRepo: boolean;
  temperature: number;
  signal: AbortSignal;
  failureMessage: string;
  onDelta: (content: string) => void;
}

interface StreamedCompletion {
  content: string;
  toolCalls: AgentToolCall[];
}

/**
 * 只读代码工具环：
 * - 若本轮产生 tool_calls：不向 UI 推正文，执行工具后继续
 * - 若本轮只有正文：SSE 流式 onDelta（恢复鲸灵流式观感）
 * thinking 在工具环内关闭，避免 reasoning_content 回传复杂度。
 */
export async function runAgentCodeToolLoop({
  apiKey,
  model,
  systemPrompt,
  history,
  allowedRepos,
  multiRepo,
  temperature,
  signal,
  failureMessage,
  onDelta,
}: RunAgentToolLoopOptions): Promise<void> {
  const tools: AgentToolDefinition[] = buildAgentCodeToolDefinitions(multiRepo);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  for (let round = 0; round < AGENT_CODE_TOOL_MAX_ROUNDS; round += 1) {
    const completion = await requestCompletionStreaming({
      apiKey,
      model,
      messages,
      tools,
      temperature,
      signal,
      failureMessage,
      // 仅在确认无 tool_calls 时向 UI 流式推送；见 consume 内 sawToolCalls 门闩
      onDelta,
    });

    if (completion.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: completion.content.trim() ? completion.content : null,
        tool_calls: completion.toolCalls,
      });
      for (const call of completion.toolCalls) {
        const result = await executeAgentCodeTool(call, allowedRepos);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }
      continue;
    }

    // 正文已在流式过程中经 onDelta 上屏
    return;
  }

  // 轮次耗尽：无工具收束，流式上屏
  await requestCompletionStreaming({
    apiKey,
    model,
    messages: [
      ...messages,
      {
        role: "user",
        content:
          "Tool budget exhausted. Answer with the evidence already gathered; do not claim you read more files.",
      },
    ],
    tools: null,
    temperature,
    signal,
    failureMessage,
    onDelta,
  });
}

async function requestCompletionStreaming(input: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools: AgentToolDefinition[] | null;
  temperature: number;
  signal: AbortSignal;
  failureMessage: string;
  onDelta: (content: string) => void;
}): Promise<StreamedCompletion> {
  const body: Record<string, unknown> = {
    model: input.model,
    stream: true,
    temperature: input.temperature,
    thinking: { type: "disabled" },
    messages: input.messages,
  };
  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools;
  }

  try {
    const stream = await postDeepSeekChatStream({
      apiKey: input.apiKey,
      signal: input.signal,
      body,
    });
    return await readToolLoopSseStream(stream, input.onDelta);
  } catch (error) {
    throw mapDeepSeekApiError(error, input.failureMessage);
  }
}

/**
 * 解析带可选 tool_calls 的 SSE。
 * 一旦出现 tool_calls 碎片，停止向 UI 推送 content（避免半截答案后进工具）。
 */
async function readToolLoopSseStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: (content: string) => void,
): Promise<StreamedCompletion> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let sawToolCalls = false;
  const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();

  const applyData = (data: string): void => {
    try {
      const payload: unknown = JSON.parse(data);
      if (!isRecord(payload) || !Array.isArray(payload.choices)) {
        return;
      }
      for (const choice of payload.choices) {
        if (!isRecord(choice) || !isRecord(choice.delta)) {
          continue;
        }
        const delta = choice.delta;
        if (Array.isArray(delta.tool_calls)) {
          sawToolCalls = true;
          mergeToolCallDeltas(toolAcc, delta.tool_calls);
        }
        if (typeof delta.content === "string" && delta.content) {
          content += delta.content;
          if (!sawToolCalls) {
            onDelta(redactSecrets(delta.content));
          }
        }
      }
    } catch {
      // 忽略残缺 SSE 行
    }
  };

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      buffer += decoder.decode(result.value, { stream: true });
      buffer = consumeSseDataLines(buffer, applyData);
    }
    consumeSseDataLines(`${buffer}\n`, applyData);
  } finally {
    reader.releaseLock();
  }

  const toolCalls = finalizeToolCalls(toolAcc);
  return {
    content: redactSecrets(content),
    toolCalls,
  };
}

function consumeSseDataLines(buffer: string, onData: (data: string) => void): string {
  let lineEnd = buffer.indexOf("\n");
  while (lineEnd >= 0) {
    const line = buffer.slice(0, lineEnd).trim();
    buffer = buffer.slice(lineEnd + 1);
    if (line.startsWith("data:")) {
      const data = line.slice(5).trim();
      if (data && data !== "[DONE]") {
        onData(data);
      }
    }
    lineEnd = buffer.indexOf("\n");
  }
  return buffer;
}

function mergeToolCallDeltas(
  acc: Map<number, { id: string; name: string; arguments: string }>,
  rawCalls: unknown[],
): void {
  for (const item of rawCalls) {
    if (!isRecord(item)) {
      continue;
    }
    const index = typeof item.index === "number" ? item.index : 0;
    const prev = acc.get(index) ?? { id: "", name: "", arguments: "" };
    if (typeof item.id === "string" && item.id) {
      prev.id = item.id;
    }
    if (isRecord(item.function)) {
      if (typeof item.function.name === "string" && item.function.name) {
        prev.name = item.function.name;
      }
      if (typeof item.function.arguments === "string") {
        prev.arguments += item.function.arguments;
      }
    }
    acc.set(index, prev);
  }
}

function finalizeToolCalls(
  acc: Map<number, { id: string; name: string; arguments: string }>,
): AgentToolCall[] {
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, call]) => call.id && call.name)
    .map(([, call]) => ({
      id: call.id,
      type: "function" as const,
      function: {
        name: call.name,
        arguments: call.arguments || "{}",
      },
    }));
}

/** 供单测 / 文档：工具启用条件 */
export function shouldEnableAgentCodeTools(options: {
  skillMode: string | null;
  allowedRepos: readonly AgentCodeToolRepo[];
}): boolean {
  if (options.skillMode === "resume" || options.skillMode === "skill-creator") {
    return false;
  }
  return options.allowedRepos.length > 0;
}
