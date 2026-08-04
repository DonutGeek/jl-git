import { buildProjectDescriptionSystemPrompt } from "@/prompts/git";
import { mapDeepSeekHttpError } from "@/services/ai/ai.httpError";
import { DEFAULT_UTILITY_MODEL } from "@/services/ai/ai.models";
import { redactSecrets } from "@/services/ai/ai.sanitize";
import { getAgentKey } from "@/services/ai/ai.settings";
import { getProjectProfileSnapshot } from "@/services/project/project.profile";

import i18n from "@/i18n";
import type { AppError } from "@/types/error";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
const AI_REQUEST_TIMEOUT_MS = 30_000;
const MAX_DESCRIPTION_CHARS = 800;

/**
 * 根据项目入口、业务逻辑与依赖清单生成项目简介（2～4 句）。
 */
export async function generateProjectDescription(
  repoPath: string,
  locale: string,
): Promise<string> {
  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const snapshot = await getProjectProfileSnapshot(repoPath);
  if (snapshot.files.length === 0) {
    throw appError("VALIDATION", i18n.t("ai.errors.emptyProjectProfile"));
  }

  const userContent = [
    `目录名：${snapshot.folderName}`,
    snapshot.structure.length > 0
      ? [
          "### 项目目录结构（已忽略依赖、构建产物与隐藏文件）",
          "```text",
          ...snapshot.structure,
          "```",
        ].join("\n")
      : null,
    ...snapshot.files.map((file) => {
      const body = redactSecrets(file.content);
      const note = file.truncated ? "（内容已截断）" : "";
      return [`### ${file.name}${note}`, "```", body, "```"].join("\n");
    }),
  ]
    .filter((section): section is string => section !== null)
    .join("\n\n");

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_UTILITY_MODEL,
        temperature: 0.3,
        // V4 默认 thinking 开启；短任务保持非思考（旧 deepseek-chat 行为）
        thinking: { type: "disabled" },
        messages: [
          {
            role: "system",
            content: buildProjectDescriptionSystemPrompt(locale),
          },
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw mapDeepSeekHttpError(response.status, payload, i18n.t("ai.errors.requestFailed"));
    }

    const content = readChoiceContent(payload);
    const description = normalizeDescription(content);
    if (!description) {
      throw appError("INTERNAL", i18n.t("ai.errors.invalidResponse"));
    }
    return description;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw appError("INTERNAL", i18n.t("ai.errors.timeout"));
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizeDescription(content: string | null | undefined): string | null {
  if (!content) {
    return null;
  }
  const text = content
    .trim()
    .replace(/^```(?:text|markdown|plaintext)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^#+\s+/gm, "")
    .trim();
  if (!text) {
    return null;
  }
  return text.length > MAX_DESCRIPTION_CHARS
    ? `${text.slice(0, MAX_DESCRIPTION_CHARS).trimEnd()}…`
    : text;
}

function readChoiceContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const first = choices[0];
  if (!first || typeof first !== "object") {
    return null;
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

function appError(code: AppError["code"], message: string): AppError {
  return { code, message };
}
