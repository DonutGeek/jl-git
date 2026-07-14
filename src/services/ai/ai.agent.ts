import { getAgentKey } from "@/services/ai/ai.settings";

import i18n from "@/i18n";
import { isRecord, type AppError } from "@/types/error";
import type { AgentChatMessage } from "@/types/ai";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_AGENT_MODEL = "deepseek-chat";
const AGENT_REQUEST_TIMEOUT_MS = 60_000;
const AGENT_HISTORY_LIMIT = 20;

interface StreamAgentReplyOptions {
  messages: readonly AgentChatMessage[];
  locale: string;
  signal?: AbortSignal;
  onDelta: (content: string) => void;
}

/**
 * 从 DeepSeek 流式读取当前项目会话的回复。
 * 会话由调用方按项目隔离后传入，本服务不读取其它项目的消息。
 */
export async function streamAgentReply({
  messages,
  locale,
  signal,
  onDelta,
}: StreamAgentReplyOptions): Promise<void> {
  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const controller = new AbortController();
  const abortFromCaller = (): void => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = window.setTimeout(() => controller.abort(), AGENT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_AGENT_MODEL,
        stream: true,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: buildAgentSystemPrompt(locale),
          },
          ...messages.slice(-AGENT_HISTORY_LIMIT).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await readResponseJson(response);
      throw appError("INTERNAL", readErrorMessage(payload) ?? i18n.t("agent.replyFailed"));
    }
    if (!response.body) {
      throw appError("INTERNAL", i18n.t("agent.replyFailed"));
    }

    await readSseStream(response.body, onDelta);
  } catch (error) {
    if (controller.signal.aborted) {
      throw appError("INTERNAL", i18n.t("agent.replyTimeout"));
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function buildAgentSystemPrompt(locale: string): string {
  const language = locale === "zh-CN" ? "Simplified Chinese" : "English";
  return [
    "You are 鲸灵, a helpful Git desktop assistant.",
    `Reply in ${language} unless the user explicitly requests another language.`,
    "You only know the messages from the current project conversation.",
    "Do not claim to have inspected branches, commits, files, or executed Git commands unless that information is present in the conversation.",
    "Keep answers concise, practical, and clearly state uncertainty.",
  ].join(" ");
}

async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: (content: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      buffer += decoder.decode(result.value, { stream: true });
      buffer = consumeSseLines(buffer, onDelta);
    }
    consumeSseLines(`${buffer}\n`, onDelta);
  } finally {
    reader.releaseLock();
  }
}

function consumeSseLines(buffer: string, onDelta: (content: string) => void): string {
  let lineEnd = buffer.indexOf("\n");
  while (lineEnd >= 0) {
    const line = buffer.slice(0, lineEnd).trim();
    buffer = buffer.slice(lineEnd + 1);
    if (line.startsWith("data:")) {
      const data = line.slice(5).trim();
      if (data && data !== "[DONE]") {
        const content = readDeltaContent(data);
        if (content) {
          onDelta(content);
        }
      }
    }
    lineEnd = buffer.indexOf("\n");
  }
  return buffer;
}

function readDeltaContent(data: string): string | null {
  try {
    const payload: unknown = JSON.parse(data);
    if (!isRecord(payload) || !Array.isArray(payload.choices)) {
      return null;
    }
    for (const choice of payload.choices) {
      if (!isRecord(choice) || !isRecord(choice.delta) || typeof choice.delta.content !== "string") {
        continue;
      }
      return choice.delta.content;
    }
    return null;
  } catch {
    return null;
  }
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.message !== "string") {
    return null;
  }
  return payload.error.message;
}

function appError(code: AppError["code"], message: string): AppError {
  return { code, message };
}
