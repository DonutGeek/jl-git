import { buildCommitMessageSystemPrompt } from "@/prompts/git";
import { getAgentKey, getAiInstructions } from "@/services/ai/ai.settings";
import { mapDeepSeekHttpError } from "@/services/ai/ai.httpError";
import { readCommitModelId } from "@/services/ai/ai.models";
import { redactSecrets } from "@/services/ai/ai.sanitize";
import { getCommitPatchDiff, getStagedDiff } from "@/services/git/git.diff";

import i18n from "@/i18n";
import type { AppError } from "@/types/error";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
const AI_REQUEST_TIMEOUT_MS = 30_000;
const AI_DIFF_MAX_BYTES = 65_536;
const CONVENTIONAL_COMMIT_PATTERN =
  /^(feat|fix|refactor|style|docs|test|perf|build|ci|chore)(\([^)\r\n]+\))?:\s+\S.+$/;

export interface GenerateCommitMessageOptions {
  /** 基于该提交的 patch（修改提交信息）；缺省则用暂存区 */
  commitRev?: string;
}

/**
 * 根据暂存区或指定提交的改动生成 Conventional Commit 标题与简短正文。
 * 模型只提供建议，提交 / 改写动作仍由用户确认。
 */
export async function generateCommitMessage(
  repoPath: string,
  locale: string,
  options?: GenerateCommitMessageOptions,
): Promise<string> {
  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const commitRev = options?.commitRev?.trim();
  const context = commitRev
    ? await getCommitPatchDiff(repoPath, commitRev, AI_DIFF_MAX_BYTES)
    : await getStagedDiff(repoPath, AI_DIFF_MAX_BYTES);
  const { commit: commitInstructions } = await getAiInstructions();
  const sanitizedPatch = redactSecrets(context.patch);
  if (!sanitizedPatch.trim()) {
    throw appError(
      "VALIDATION",
      i18n.t(commitRev ? "ai.errors.emptyCommitDiff" : "ai.errors.emptyStagedDiff"),
    );
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
        model: readCommitModelId(),
        temperature: 0.2,
        // 提交文案固定非思考，与设置所选模型无关
        thinking: { type: "disabled" },
        messages: [
          {
            role: "system",
            content: buildCommitMessageSystemPrompt(locale, commitInstructions),
          },
          {
            role: "user",
            content: [
              commitRev
                ? context.truncated
                  ? "以下提交 diff 已因长度截断，请只基于可见内容总结。"
                  : "以下是完整的提交 diff。"
                : context.truncated
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
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw mapDeepSeekHttpError(response.status, payload, i18n.t("ai.errors.requestFailed"));
    }

    const content = readCommitChoiceContent(payload);
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
  if (!firstLine || firstLine.length > 200 || !CONVENTIONAL_COMMIT_PATTERN.test(firstLine)) {
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

function readCommitChoiceContent(payload: unknown): string | null {
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
