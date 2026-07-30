import { mapDeepSeekHttpError } from "@/services/ai/ai.httpError";
import { AGENT_CODE_TOOL_MAX_ROUNDS } from "@/services/agent/agent.codePolicy";
import {
  buildAgentCodeToolDefinitions,
  executeAgentCodeTool,
  type AgentCodeToolRepo,
  type AgentToolCall,
  type AgentToolDefinition,
} from "@/services/ai/ai.tools";
import { redactSecrets } from "@/services/ai/ai.sanitize";
import { isRecord, type AppError } from "@/types/error";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";

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

/**
 * 只读代码工具环：工具轮非流式；得到最终正文后一次性上屏。
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
    const payload = await requestCompletion({
      apiKey,
      model,
      messages,
      tools,
      temperature,
      signal,
      failureMessage,
    });

    const choice = payload.choices[0];
    const message = choice?.message;
    if (!message) {
      throw appError("INTERNAL", failureMessage);
    }

    const toolCalls = normalizeToolCalls(message.tool_calls);
    if (toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: typeof message.content === "string" ? message.content : null,
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        const result = await executeAgentCodeTool(call, allowedRepos);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }
      continue;
    }

    const content =
      typeof message.content === "string" ? redactSecrets(message.content.trim()) : "";
    if (content) {
      onDelta(content);
    }
    return;
  }

  // 轮次耗尽：再请求一次无工具的收束回答
  const closing = await requestCompletion({
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
  });
  const closingContent = closing.choices[0]?.message?.content;
  if (typeof closingContent === "string" && closingContent.trim()) {
    onDelta(redactSecrets(closingContent.trim()));
  }
}

interface CompletionPayload {
  choices: Array<{
    message?: {
      content?: unknown;
      tool_calls?: unknown;
    };
  }>;
}

async function requestCompletion(input: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools: AgentToolDefinition[] | null;
  temperature: number;
  signal: AbortSignal;
  failureMessage: string;
}): Promise<CompletionPayload> {
  const body: Record<string, unknown> = {
    model: input.model,
    stream: false,
    temperature: input.temperature,
    thinking: { type: "disabled" },
    messages: input.messages,
  };
  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools;
  }

  const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });

  if (!response.ok) {
    const payload = await readResponseJson(response);
    throw mapDeepSeekHttpError(response.status, payload, input.failureMessage);
  }

  const payload = await readResponseJson(response);
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw appError("INTERNAL", input.failureMessage);
  }
  return payload as unknown as CompletionPayload;
}

function normalizeToolCalls(raw: unknown): AgentToolCall[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const calls: AgentToolCall[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== "string") {
      continue;
    }
    if (!isRecord(item.function) || typeof item.function.name !== "string") {
      continue;
    }
    const args = typeof item.function.arguments === "string" ? item.function.arguments : "{}";
    calls.push({
      id: item.id,
      type: "function",
      function: {
        name: item.function.name,
        arguments: args,
      },
    });
  }
  return calls;
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function appError(code: AppError["code"], message: string): AppError {
  return { code, message };
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
