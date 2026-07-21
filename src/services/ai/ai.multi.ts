import { getAgentKey, getAiInstructions } from "@/services/ai/ai.settings";
import { redactSecrets } from "@/services/ai/ai.sanitize";
import { buildResumeSystemPrompt } from "@/prompts/resume";
import i18n from "@/i18n";
import { isRecord, type AppError } from "@/types/error";
import type { AgentChatMessage } from "@/types/ai";
import type { AgentProjectProfile } from "@/types/agent";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
/** 简历插件使用 V4 Pro；thinking 提升成稿质量，正文只消费 content */
const DEEPSEEK_RESUME_MODEL = "deepseek-v4-pro";
const REQUEST_TIMEOUT_MS = 150_000;
const HISTORY_LIMIT = 24;
const CONTEXT_CHAR_BUDGET = 48_000;
/** 每仓注入「主题索引」的提交条数（轻量，便于全面归类） */
/** 与画像时间分桶上限对齐，避免再按「最近」截断丢掉早期桶 */
const CONTEXT_SUBJECT_COMMITS_PER_PROJECT = 48;
/** 每仓注入带改动/摘录的详细提交条数 */
const CONTEXT_DETAIL_COMMITS_PER_PROJECT = 6;
/** README 注入上限，避免挤掉提交主题 */
const CONTEXT_README_CHARS = 1_800;

interface StreamMultiAgentReplyOptions {
  messages: readonly AgentChatMessage[];
  profiles: readonly AgentProjectProfile[];
  gitAuthors: ReadonlyArray<{ name: string; email: string }>;
  locale: string;
  signal?: AbortSignal;
  /** 关闭时同模型禁用 thinking，无 reasoning 流（与单仓一致） */
  enableThinking?: boolean;
  onDelta: (content: string) => void;
  /** DeepSeek thinking 的 reasoning_content 增量 */
  onReasoningDelta?: (content: string) => void;
}

/** 多仓鲸灵流式对话（复用鲸灵 Key；简历等插件走独立 system prompt）。 */
export async function streamMultiAgentReply({
  messages,
  profiles,
  gitAuthors,
  locale,
  signal,
  enableThinking = true,
  onDelta,
  onReasoningDelta,
}: StreamMultiAgentReplyOptions): Promise<void> {
  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const { resume: resumeInstructions } = await getAiInstructions();
  const projectContext = redactSecrets(
    formatProfilesContext(profiles, gitAuthors),
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
        model: DEEPSEEK_RESUME_MODEL,
        stream: true,
        // 略提高以利于简历表述升维，仍靠 system 硬规则约束事实与禁写依据
        temperature: 0.55,
        ...(enableThinking
          ? {
              thinking: { type: "enabled" },
              reasoning_effort: "high",
            }
          : {
              thinking: { type: "disabled" },
            }),
        messages: [
          {
            role: "system",
            content: buildResumeSystemPrompt(
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
        readErrorMessage(payload) ?? i18n.t("multiAgent.replyFailed"),
      );
    }
    if (!response.body) {
      throw appError("INTERNAL", i18n.t("multiAgent.replyFailed"));
    }

    await readSseStream(response.body, onDelta, onReasoningDelta);
  } catch (error) {
    if (controller.signal.aborted) {
      throw appError("INTERNAL", i18n.t("multiAgent.replyTimeout"));
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function formatProfilesContext(
  profiles: readonly AgentProjectProfile[],
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
    "Evidence policy: subjectIndex + changed paths are enough to write approach bullets; diff excerpts are optional boosts. Never refuse or ask user for more evidence because excerpts are truncated. All Git data below is from read-only queries.",
    "Output only project-experience blocks; never write contact/basics sections (name/phone/email).",
    "Git 作者账号（来自设置 → Git 的全部配置项，与启用/停用无关；提交命中任一即计入）：",
    authorLines,
    "项目列表：下列为全部已登记仓库，列举时必须全部告知用户，不要因 matchedCommits=0 而省略或替用户筛选「没改过」的仓。",
    authors.length > 0
      ? "提交摘要：各仓 recentCommits 已按上述 Git 账号收窄；matchedCommits=0 表示暂无本人抽样提交，仍须出现在项目清单里；成稿时无证据则不要编造项目经历。"
      : "Git 作者未配置：请引导用户去设置 → Git 添加账号；下列仍列出全部已登记仓库。",
    "Time ranges are from matched sampled commits (not necessarily the absolute first commit of huge repos).",
  ].join("\n");

  // 先拼「主题索引优先」的块，超预算时按仓公平缩短，避免整段截断导致后半仓库证据丢失
  const blocks = profiles
    .map((profile) => formatProfileBlock(profile, "full"))
    .filter((block): block is string => block !== null);

  let text = `${header}\n\n${blocks.join("\n\n")}`;
  if (text.length <= CONTEXT_CHAR_BUDGET) {
    return text;
  }

  const compactBlocks = profiles
    .map((profile) => formatProfileBlock(profile, "compact"))
    .filter((block): block is string => block !== null);
  text = `${header}\n\n${compactBlocks.join("\n\n")}`;
  if (text.length <= CONTEXT_CHAR_BUDGET) {
    return text;
  }

  return fairTruncateBlocks(header, compactBlocks, CONTEXT_CHAR_BUDGET);
}

function formatProfileBlock(
  profile: AgentProjectProfile,
  mode: "full" | "compact",
): string | null {
  if (profile.error) {
    return `### ${profile.projectName}\nERROR: ${profile.error}`;
  }
  if (profile.recentCommits.length === 0) {
    const readmeRaw = profile.readmeExcerpt?.trim() ?? "";
    const readmeLimit = mode === "full" ? CONTEXT_README_CHARS : 800;
    const readmeExcerpt =
      readmeRaw.length > readmeLimit
        ? `${readmeRaw.slice(0, readmeLimit)}\n…[truncated]`
        : readmeRaw;
    return [
      `### ${profile.projectName}`,
      `repoFolderName: ${profile.projectName}`,
      `projectId: ${profile.projectId}`,
      "matchedCommits=0",
      "authorInvolvementRange: —",
      `techStack (package.json ∩ author usage): ${profile.techStackHints.join(", ") || "—"}`,
      readmeExcerpt
        ? `readmeExcerpt:\n${readmeExcerpt}`
        : "readmeExcerpt: (none)",
      "(no author-matched commit samples; still list this project when enumerating; do not invent personal contributions)",
    ].join("\n");
  }

  const subjectLimit =
    mode === "full"
      ? CONTEXT_SUBJECT_COMMITS_PER_PROJECT
      : Math.min(24, CONTEXT_SUBJECT_COMMITS_PER_PROJECT);
  const detailLimit =
    mode === "full" ? CONTEXT_DETAIL_COMMITS_PER_PROJECT : 3;
  const readmeLimit = mode === "full" ? CONTEXT_README_CHARS : 800;

  const subjectIndex = profile.recentCommits
    .slice(0, subjectLimit)
    .map(
      (commit) =>
        `- ${commit.authoredAt.slice(0, 10)} ${commit.shortId} ${commit.subject}`,
    )
    .join("\n");

  const detailCommits = profile.recentCommits
    .slice(0, detailLimit)
    .map((commit) => formatCommitEvidence(commit, mode === "compact"))
    .join("\n\n");

  const readmeRaw = profile.readmeExcerpt?.trim() ?? "";
  const readmeExcerpt =
    readmeRaw.length > readmeLimit
      ? `${readmeRaw.slice(0, readmeLimit)}\n…[truncated]`
      : readmeRaw;
  const readmeBlock = readmeExcerpt
    ? [
        `readmePath: ${profile.readmePath ?? "README"}`,
        "readmeExcerpt (judge usefulness yourself; ignore boilerplate/placeholder):",
        readmeExcerpt,
      ].join("\n")
    : "readmeExcerpt: (none)";

  const involvementStart = formatResumeMonth(profile.firstCommitAt);
  const involvementEnd = formatResumeMonth(profile.lastCommitAt);
  const involvementRange =
    involvementStart && involvementEnd
      ? `${involvementStart} – ${involvementEnd}`
      : "—";

  return [
    `### ${profile.projectName}`,
    `repoFolderName: ${profile.projectName}`,
    // 作者参与周期（接手首提交 → 末次提交）；成稿必须写入 **项目周期**
    `authorInvolvementRange: ${involvementRange}`,
    `authorFirstCommitAt: ${profile.firstCommitAt ?? "—"}`,
    `authorLastCommitAt: ${profile.lastCommitAt ?? "—"}`,
    `matchedCommits=${profile.sampledCommitCount}`,
    `techStack (package.json ∩ author usage): ${profile.techStackHints.join(", ") || "—"}`,
    profile.packageTechStack && profile.packageTechStack.length > 0
      ? `packageTechCandidates: ${profile.packageTechStack.join(", ")}`
      : null,
    readmeBlock,
    "subjectIndex (cluster by theme; enough for approach bullets):",
    subjectIndex || "(none)",
    detailCommits
      ? `commitDetails (paths/excerpts when available):\n${detailCommits}`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** 超预算时按仓库轮转截取，避免只保留前几个仓 */
function fairTruncateBlocks(
  header: string,
  blocks: readonly string[],
  budget: number,
): string {
  if (blocks.length === 0) {
    return `${header.slice(0, budget)}\n\n[truncated]`;
  }
  const overhead = header.length + 2;
  const perBlock = Math.max(
    1_200,
    Math.floor((budget - overhead) / blocks.length) - 8,
  );
  const trimmed = blocks.map((block) =>
    block.length <= perBlock
      ? block
      : `${block.slice(0, perBlock)}\n…[project truncated]`,
  );
  let text = `${header}\n\n${trimmed.join("\n\n")}`;
  if (text.length > budget) {
    text = `${text.slice(0, budget)}\n\n[truncated]`;
  }
  return text;
}

function formatCommitEvidence(
  commit: {
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
  },
  pathsOnly = false,
): string {
  const head = `- ${commit.authoredAt.slice(0, 10)} ${commit.shortId} <${commit.authorEmail}> ${commit.subject}`;
  const files = commit.changedFiles ?? [];
  if (files.length === 0) {
    return `${head}\n  (paths not loaded; use subject for approach-level bullets)`;
  }
  const fileBlocks = files.map((file) => {
    const stats =
      file.additions != null || file.deletions != null
        ? ` +${file.additions ?? 0}/-${file.deletions ?? 0}`
        : "";
    const snippet =
      !pathsOnly && file.snippet
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
  onReasoningDelta?: (content: string) => void,
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
        if (!isRecord(delta)) continue;
        if (
          typeof delta.reasoning_content === "string" &&
          delta.reasoning_content &&
          onReasoningDelta
        ) {
          onReasoningDelta(delta.reasoning_content);
        }
        if (typeof delta.content === "string" && delta.content) {
          onDelta(delta.content);
        }
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

/** 简历周期展示：YYYY.MM；无效则 null */
function formatResumeMonth(iso: string | null): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  if (!match) return null;
  return `${match[1]}.${match[2]}`;
}

function appError(code: AppError["code"], message: string): AppError {
  return { code, message };
}
