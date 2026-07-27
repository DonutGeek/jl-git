import { buildBranchNameSystemPrompt } from "@/prompts/git";
import { mapDeepSeekHttpError } from "@/services/ai/ai.httpError";
import { readCommitModelId } from "@/services/ai/ai.models";
import { getAgentKey } from "@/services/ai/ai.settings";
import { normalizeBranchPrefix } from "@/utils/branchPrefix";

import i18n from "@/i18n";
import type { AppError } from "@/types/error";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
const AI_REQUEST_TIMEOUT_MS = 30_000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BRANCH_NAME_LENGTH = 120;

export interface BranchNameAttachmentInput {
  name: string;
  text: string;
  truncated?: boolean;
}

export interface GenerateBranchNameOptions {
  detail: string;
  prefix: string;
  locale: string;
  /** 已抽取文本的附件（与详情并存） */
  attachments?: BranchNameAttachmentInput[];
}

/**
 * 根据用户填写的详情与可选附件生成带前缀的短分支名。
 * 模型只提供建议，创建动作仍由用户在对话框中确认。
 */
export async function generateBranchName(
  options: GenerateBranchNameOptions,
): Promise<string> {
  const detail = options.detail.trim();
  const attachments = (options.attachments ?? []).filter(
    (item) => item.text.trim().length > 0,
  );
  if (!detail && attachments.length === 0) {
    throw appError("VALIDATION", i18n.t("repo.aiBranchInputRequired"));
  }

  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const prefix = normalizeBranchPrefix(options.prefix);
  const userContent = buildBranchNameUserContent(detail, attachments, prefix);
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
        thinking: { type: "disabled" },
        messages: [
          {
            role: "system",
            content: buildBranchNameSystemPrompt(options.locale, prefix),
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
      throw mapDeepSeekHttpError(
        response.status,
        payload,
        i18n.t("ai.errors.requestFailed"),
      );
    }

    const content = readChoiceContent(payload);
    const branchName = normalizeBranchName(content, prefix);
    if (!branchName) {
      throw appError("INTERNAL", i18n.t("ai.errors.invalidResponse"));
    }
    return branchName;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw appError("INTERNAL", i18n.t("ai.errors.timeout"));
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/** 清洗模型输出为 `prefix + kebab-slug`；不合格返回 null */
export function normalizeBranchName(
  content: string | null | undefined,
  prefixRaw: string,
): string | null {
  if (!content) {
    return null;
  }
  const prefix = normalizeBranchPrefix(prefixRaw);
  let line = content
    .trim()
    .replace(/^```(?:text|plaintext|bash)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .split("\n")[0]
    ?.trim();
  if (!line) {
    return null;
  }
  line = line.replace(/^['"`]+|['"`]+$/g, "").trim();
  line = line.replace(/^(?:branch\s*name\s*[:=]\s*)/i, "").trim();

  let slugPart = line;
  if (prefix && slugPart.startsWith(prefix)) {
    slugPart = slugPart.slice(prefix.length);
  } else if (prefix && slugPart.startsWith(prefix.replace(/\/$/, ""))) {
    // 模型偶发省略尾斜杠
    const withoutSlash = prefix.replace(/\/$/, "");
    if (slugPart === withoutSlash) {
      slugPart = "";
    } else if (slugPart.startsWith(`${withoutSlash}/`)) {
      slugPart = slugPart.slice(withoutSlash.length + 1);
    }
  }

  const slug = sanitizeSlug(slugPart);
  if (!slug || !SLUG_PATTERN.test(slug)) {
    return null;
  }

  const full = `${prefix}${slug}`;
  if (full.length > MAX_BRANCH_NAME_LENGTH) {
    return null;
  }
  return full;
}

function buildBranchNameUserContent(
  detail: string,
  attachments: BranchNameAttachmentInput[],
  prefix: string,
): string {
  const parts = [
    prefix ? `Branch prefix: ${prefix}` : "Branch prefix: (none)",
    "Detail:",
    detail || "(none)",
  ];
  if (attachments.length > 0) {
    parts.push("Attachments:");
    for (const file of attachments) {
      const note = file.truncated ? " (truncated)" : "";
      parts.push(`### ${file.name}${note}`, file.text.trim());
    }
  }
  return parts.join("\n");
}

function sanitizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9/-]/g, "")
    .replace(/\/+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
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
