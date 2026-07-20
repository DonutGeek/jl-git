import { getAgentKey, getAiInstructions } from "@/services/ai/ai.settings";
import { redactSecrets } from "@/services/ai/ai.sanitize";
import { buildResumeHelperSystemPrompt } from "@/prompts/resumeHelper";
import i18n from "@/i18n";
import { isRecord, type AppError } from "@/types/error";
import type { AgentChatMessage } from "@/types/ai";
import type { ResumeHelperIdentity, ResumeProjectProfile } from "@/types/resumeHelper";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const REQUEST_TIMEOUT_MS = 90_000;
const HISTORY_LIMIT = 24;
const CONTEXT_CHAR_BUDGET = 28_000;

interface StreamResumeHelperReplyOptions {
  messages: readonly AgentChatMessage[];
  profiles: readonly ResumeProjectProfile[];
  identity: ResumeHelperIdentity;
  gitAuthors: ReadonlyArray<{ name: string; email: string }>;
  locale: string;
  signal?: AbortSignal;
  onDelta: (content: string) => void;
}

/** 简历帮专用流式对话（复用鲸灵 Key，独立 system prompt）。 */
export async function streamResumeHelperReply({
  messages,
  profiles,
  identity,
  gitAuthors,
  locale,
  signal,
  onDelta,
}: StreamResumeHelperReplyOptions): Promise<void> {
  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const { resumeHelper: resumeInstructions } = await getAiInstructions();
  const projectContext = redactSecrets(
    formatProfilesContext(profiles, identity, gitAuthors),
  );
  const controller = new AbortController();
  const abortFromCaller = (): void => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        stream: true,
        temperature: 0.45,
        messages: [
          {
            role: "system",
            content: buildResumeHelperSystemPrompt(
              locale,
              projectContext,
              resumeInstructions,
            ),
          },
          ...messages.slice(-HISTORY_LIMIT).map((message) => ({
            role: message.role,
            content: redactSecrets(message.content),
          })),
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await readResponseJson(response);
      throw appError(
        "INTERNAL",
        readErrorMessage(payload) ?? i18n.t("resumeHelper.replyFailed"),
      );
    }
    if (!response.body) {
      throw appError("INTERNAL", i18n.t("resumeHelper.replyFailed"));
    }

    await readSseStream(response.body, onDelta);
  } catch (error) {
    if (controller.signal.aborted) {
      throw appError("INTERNAL", i18n.t("resumeHelper.replyTimeout"));
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function formatProfilesContext(
  profiles: readonly ResumeProjectProfile[],
  identity: ResumeHelperIdentity,
  gitAuthors: ReadonlyArray<{ name: string; email: string }>,
): string {
  const authors = gitAuthors.filter(
    (author) => author.name.trim() || author.email.trim(),
  );
  const authorLines =
    authors.length > 0
      ? authors
          .map(
            (author, index) =>
              `- 账号${index + 1}: ${author.name.trim() || "—"} <${author.email.trim() || "—"}>`,
          )
          .join("\n")
      : "- （未配置，请在设置 → Git 中添加）";

  const header = [
    `Registered projects: ${profiles.length}.`,
    "Evidence policy: commit messages are clues only; prefer changed files + code/diff excerpts when present. All Git data below is from read-only queries.",
    "## 用户身份配置（设置中已保存；已填字段勿重复追问）",
    `- 姓名: ${identity.displayName.trim() || "（未配置）"}`,
    `- 手机: ${identity.phone.trim() || "（未配置）"}`,
    `- 联系邮箱: ${identity.email.trim() || "（未配置）"}`,
    "Git 作者账号（来自设置 → Git 的全部配置项，与启用/停用无关；提交命中任一即计入）：",
    authorLines,
    authors.length > 0
      ? "提交过滤：已按上述全部 Git 账号过滤仓库画像中的提交样本（启用状态仅影响全局 git config 提交身份，不影响本过滤）。"
      : "Git 作者未配置：请引导用户去设置 → Git 添加账号，或对话中补充后再写贡献。",
    "Time ranges are from sampled commits (not necessarily the absolute first commit of huge repos).",
  ].join("\n");

  const blocks = profiles.map((profile) => {
    if (profile.error) {
      return `### ${profile.projectName}\nERROR: ${profile.error}`;
    }
    const commits = profile.recentCommits
      .slice(0, 12)
      .map((commit) => formatCommitEvidence(commit))
      .join("\n\n");
    return [
      `### ${profile.projectName}`,
      `first≈${profile.firstCommitAt ?? "—"} last≈${profile.lastCommitAt ?? "—"} sampled=${profile.sampledCommitCount}`,
      `techHints: ${profile.techStackHints.join(", ") || "—"}`,
      commits ? `commits:\n${commits}` : "commits: (none in sample)",
    ].join("\n");
  });

  let text = `${header}\n\n${blocks.join("\n\n")}`;
  if (text.length > CONTEXT_CHAR_BUDGET) {
    text = `${text.slice(0, CONTEXT_CHAR_BUDGET)}\n\n[truncated]`;
  }
  return text;
}

function formatCommitEvidence(commit: {
  shortId: string;
  subject: string;
  authorEmail: string;
  authoredAt: string;
  changedFiles?: ReadonlyArray<{
    path: string;
    status: string;
    additions?: number | null;
    deletions?: number | null;
    snippet?: string;
  }>;
}): string {
  const head = `- ${commit.authoredAt.slice(0, 10)} ${commit.shortId} <${commit.authorEmail}> ${commit.subject}`;
  const files = commit.changedFiles ?? [];
  if (files.length === 0) {
    return `${head}\n  (no code evidence loaded; do not invent implementation details)`;
  }
  const fileBlocks = files.map((file) => {
    const stats =
      file.additions != null || file.deletions != null
        ? ` +${file.additions ?? 0}/-${file.deletions ?? 0}`
        : "";
    const snippet = file.snippet
      ? `\n    code excerpt:\n${indentBlock(file.snippet, "    ")}`
      : "";
    return `  · ${file.status} ${file.path}${stats}${snippet}`;
  });
  return [head, ...fileBlocks].join("\n");
}

function indentBlock(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (content: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed: unknown = JSON.parse(data);
        if (!isRecord(parsed)) continue;
        const choices = parsed.choices;
        if (!Array.isArray(choices) || choices.length === 0) continue;
        const first = choices[0];
        if (!isRecord(first)) continue;
        const delta = first.delta;
        if (!isRecord(delta) || typeof delta.content !== "string") continue;
        if (delta.content) onDelta(delta.content);
      } catch {
        // 忽略残缺 SSE 行
      }
    }
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
  if (!isRecord(payload)) return null;
  const error = payload.error;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  if (typeof payload.message === "string") {
    return payload.message;
  }
  return null;
}

function appError(code: AppError["code"], message: string): AppError {
  return { code, message };
}
