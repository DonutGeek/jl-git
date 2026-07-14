import { getAgentKey, getAiInstructions } from "@/services/ai/ai.settings";
import { redactSecrets } from "@/services/ai/ai.sanitize";
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
 * 根据已暂存的改动生成 Conventional Commit 标题与简短正文。
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
    "Return a commit message with a Conventional Commit subject and a concise body.",
    "Format: <type>(<scope>): <summary>\\n\\n- <specific change or user-facing effect>\\n- <specific change or user-facing effect>.",
    "The subject must be one line. The body must contain 2-4 factual bullet points when the diff provides enough detail.",
    "Omit the body when the diff does not support reliable details; never guess.",
    "Scope is optional when uncertain.",
    "Allowed types: feat, fix, refactor, style, docs, test, perf, build, ci, chore.",
    "Use the actual user-facing effect, not implementation process. Never include headings, code fences, or secrets.",
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
  const lines = content
    .trim()
    .replace(/^```(?:text|plaintext)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .split("\n")
    .map((line) => line.trim());
  const firstLine = lines[0]?.replace(/`/g, "").trim();
  if (
    !firstLine ||
    firstLine.length > 200 ||
    !CONVENTIONAL_COMMIT_PATTERN.test(firstLine)
  ) {
    return null;
  }

  const detailLines = lines
    .slice(1)
    .filter((line) => /^[-*•]\s+\S/.test(line))
    .slice(0, 4)
    .map((line) => `- ${line.replace(/^[-*•]\s+/, "")}`)
    .filter((line) => line.length <= 240);

  return detailLines.length > 0 ? `${firstLine}\n\n${detailLines.join("\n")}` : firstLine;
}

function appError(code: AppError["code"], message: string): AppError {
  return { code, message };
}
