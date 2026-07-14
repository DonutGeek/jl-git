import { getAgentKey, getAiInstructions } from "@/services/ai/ai.settings";
import { getStagedDiff } from "@/services/git/git.diff";

import i18n from "@/i18n";
import type { AppError } from "@/types/error";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_COMMIT_MODEL = "deepseek-chat";
const AI_REQUEST_TIMEOUT_MS = 30_000;
const AI_DIFF_MAX_BYTES = 65_536;
const CONVENTIONAL_COMMIT_PATTERN =
  /^(feat|fix|refactor|style|docs|test|perf|build|ci|chore)(\([^)\r\n]+\))?:\s+\S.+$/;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

/**
 * 根据已暂存的改动生成一条 Conventional Commit 标题。
 * 模型只提供建议，提交动作仍由用户在 CommitBox 中确认。
 */
export async function generateCommitMessage(
  repoPath: string,
  locale: string,
): Promise<string> {
  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const context = await getStagedDiff(repoPath, AI_DIFF_MAX_BYTES);
  const { commit: commitInstructions } = await getAiInstructions();
  const sanitizedPatch = redactSecrets(context.patch);
  if (!sanitizedPatch.trim()) {
    throw appError("VALIDATION", i18n.t("ai.errors.emptyStagedDiff"));
  }

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
        model: DEEPSEEK_COMMIT_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: buildSystemPrompt(locale, commitInstructions) },
          {
            role: "user",
            content: [
              context.truncated
                ? "以下暂存区 diff 已因长度截断，请只基于可见内容总结。"
                : "以下是完整的暂存区 diff。",
              "```diff",
              sanitizedPatch,
              "```",
            ].join("\n"),
          },
        ],
      }),
      signal: controller.signal,
    });
    const payload = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      throw appError("INTERNAL", payload.error?.message ?? i18n.t("ai.errors.requestFailed"));
    }

    const content = payload.choices?.[0]?.message?.content;
    const message = normalizeCommitMessage(content);
    if (!message) {
      throw appError("INTERNAL", i18n.t("ai.errors.invalidResponse"));
    }
    return message;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw appError("INTERNAL", i18n.t("ai.errors.timeout"));
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function buildSystemPrompt(locale: string, commitInstructions: string): string {
  const language = locale === "zh-CN" ? "简体中文" : "English";
  const prompt = [
    "You generate a Git commit message from a staged diff.",
    `Write the summary in ${language}.`,
    "Return exactly one single-line Conventional Commit message and nothing else.",
    "Format: <type>(<scope>): <summary>. Scope is optional when uncertain.",
    "Allowed types: feat, fix, refactor, style, docs, test, perf, build, ci, chore.",
    "Use the actual user-facing effect, not implementation process. Never include markdown, explanation, code fences, or secrets.",
  ].join(" ");
  if (!commitInstructions.trim()) {
    return prompt;
  }
  return `${prompt}\n\nRepository-specific commit instructions:\n${commitInstructions.trim()}`;
}

function normalizeCommitMessage(content: string | null | undefined): string | null {
  if (!content) {
    return null;
  }
  const firstLine = content
    .trim()
    .replace(/^```(?:text|plaintext)?\s*/i, "")
    .split("\n")[0]
    ?.replace(/`/g, "")
    .trim();
  if (
    !firstLine ||
    firstLine.length > 200 ||
    !CONVENTIONAL_COMMIT_PATTERN.test(firstLine)
  ) {
    return null;
  }
  return firstLine;
}

/** 掩码常见凭据形式，避免误把工作区中的密钥上传给模型服务。 */
function redactSecrets(value: string): string {
  return value
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s'"`]+/gi, "$1=[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]")
    .replace(/-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]");
}

function appError(code: AppError["code"], message: string): AppError {
  return { code, message };
}
