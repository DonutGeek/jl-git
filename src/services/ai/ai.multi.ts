import { formatJlgitMetaBlock } from "@/services/agent/agent.profile";
import { getAgentKey } from "@/services/ai/ai.settings";
import { mapDeepSeekHttpError } from "@/services/ai/ai.httpError";
import { DEFAULT_AGENT_MODEL } from "@/services/ai/ai.models";
import { redactSecrets } from "@/services/ai/ai.sanitize";
import { getAgentSafetyRefusal } from "@/services/ai/ai.safety";
import { getAgentSkillMode } from "@/services/ai/ai.skillMode";
import { runAgentCodeToolLoop, shouldEnableAgentCodeTools } from "@/services/ai/ai.toolLoop";
import { buildMultiAgentSystemPrompt } from "@/prompts/agent/multi";
import { buildResumeSystemPrompt } from "@/prompts/resume";
import { buildSkillCreatorSystemPrompt } from "@/prompts/skillCreator";
import i18n from "@/i18n";
import { isRecord, type AppError } from "@/types/error";
import type { AgentChatMessage } from "@/types/ai";
import type { AgentProjectProfile } from "@/types/agent";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
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
  /** 仅来自本次简历对话中用户主动声明的 Git 作者身份 */
  resumeAuthors: ReadonlyArray<{ name: string; email: string }>;
  /** 允许代码工具访问的仓根；多仓须由 @项目 / 点名解析后传入 */
  codeToolRoots?: ReadonlyArray<{ path: string; label?: string }>;
  locale: string;
  signal?: AbortSignal;
  /** DeepSeek model id，如 deepseek-v4-pro / deepseek-v4-flash */
  model?: string;
  /** 关闭时同模型禁用 thinking，无 reasoning 流（与单仓一致） */
  enableThinking?: boolean;
  onDelta: (content: string) => void;
  /** DeepSeek thinking 的 reasoning_content 增量 */
  onReasoningDelta?: (content: string) => void;
}

/** 多仓鲸灵流式对话：默认多仓 Git Agent；技能 Prompt 仅在本轮显式启用。 */
export async function streamMultiAgentReply({
  messages,
  profiles,
  resumeAuthors,
  codeToolRoots = [],
  locale,
  signal,
  model = DEFAULT_AGENT_MODEL,
  enableThinking = true,
  onDelta,
  onReasoningDelta,
}: StreamMultiAgentReplyOptions): Promise<void> {
  const safetyRefusal = getAgentSafetyRefusal(messages, locale);
  if (safetyRefusal) {
    onDelta(safetyRefusal);
    return;
  }

  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const skillMode = getAgentSkillMode(messages);
  const resumeMode = skillMode === "resume";
  const projectContext = redactSecrets(formatProfilesContext(profiles, resumeAuthors, resumeMode));
  const systemPrompt =
    skillMode === "resume"
      ? buildResumeSystemPrompt(locale, projectContext)
      : skillMode === "skill-creator"
        ? buildSkillCreatorSystemPrompt(locale, projectContext)
        : buildMultiAgentSystemPrompt(locale, projectContext);

  const controller = new AbortController();
  const abortFromCaller = (): void => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const modelId = model.trim() || DEFAULT_AGENT_MODEL;
  const history = messages.slice(-HISTORY_LIMIT).map((message) => ({
    role: message.role,
    content: redactSecrets(message.content),
  }));
  const temperature = skillMode === "resume" ? 0.55 : skillMode === "skill-creator" ? 0.45 : 0.3;
  const allowedRepos = codeToolRoots.map((item) => ({
    path: item.path,
    label: item.label,
  }));
  const enableCodeTools = shouldEnableAgentCodeTools({ skillMode, allowedRepos });

  try {
    if (enableCodeTools) {
      await runAgentCodeToolLoop({
        apiKey,
        model: modelId,
        systemPrompt,
        history,
        allowedRepos,
        multiRepo: true,
        temperature,
        signal: controller.signal,
        failureMessage: i18n.t("multiAgent.replyFailed"),
        onDelta,
      });
      return;
    }

    const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        stream: true,
        // 成稿类技能略高；通用多仓问答更克制
        temperature,
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
            content: systemPrompt,
          },
          ...history,
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await readResponseJson(response);
      throw mapDeepSeekHttpError(response.status, payload, i18n.t("multiAgent.replyFailed"));
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
  resumeAuthors: ReadonlyArray<{ name: string; email: string }>,
  resumeMode: boolean,
): string {
  const authors = resumeAuthors.filter((author) => author.name.trim() || author.email.trim());
  const authorLines =
    authors.length > 0
      ? authors
          .map(
            (author, index) =>
              `- 账号${index + 1}: ${author.name.trim() || "—"} <${author.email.trim() || "—"}>`,
          )
          .join("\n")
      : "- （用户尚未声明）";

  // 普通多仓问答不注入作者归属；仅简历技能需要「谁的提交」
  const header = resumeMode
    ? [
        `Registered projects: ${profiles.length}.`,
        "Evidence policy: subjectIndex + changed paths are enough to write approach bullets; diff excerpts are optional boosts. Never refuse or ask user for more evidence because excerpts are truncated. All Git data below is from read-only queries.",
        "Output only project-experience blocks; never write contact/basics sections (name/phone/email).",
        "userDeclaredGitAuthors（仅来自用户在当前简历对话中主动声明；提交命中任一即计入）：",
        authorLines,
        "项目列表：下列为全部已登记仓库，列举时必须全部告知用户，不要因 matchedCommits=0 而省略或替用户筛选「没改过」的仓。",
        authors.length > 0
          ? "提交摘要：各仓 recentCommits 已按上述用户声明身份收窄；matchedCommits=0 表示暂无本人提交，仍须出现在项目清单里；成稿时不得编造。"
          : "用户尚未声明 Git 作者身份：只询问作者名或提交邮箱，不得生成项目经历。",
        "Time ranges use the first and latest commits matched by the user-declared author filters.",
      ].join("\n")
    : [
        `Registered projects: ${profiles.length}.`,
        "Evidence policy: use jlgitMeta, README excerpts, subjectIndex, tech stack hints, and optional commit details to answer Git/project questions. All data below is from read-only repository queries.",
        "项目列表：下列为全部已登记仓库；列举时必须全部告知。",
      ].join("\n");

  // 先拼「主题索引优先」的块，超预算时按仓公平缩短，避免整段截断导致后半仓库证据丢失
  const blocks = profiles
    .map((profile) => formatProfileBlock(profile, "full", resumeMode))
    .filter((block): block is string => block !== null);

  let text = `${header}\n\n${blocks.join("\n\n")}`;
  if (text.length <= CONTEXT_CHAR_BUDGET) {
    return text;
  }

  const compactBlocks = profiles
    .map((profile) => formatProfileBlock(profile, "compact", resumeMode))
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
  resumeMode: boolean,
): string | null {
  const title = profile.jlgitMeta.alias || profile.projectName;
  const jlgitMetaBlock = formatJlgitMetaBlock(profile.jlgitMeta);
  const folderName = repoFolderNameFromPath(profile.jlgitMeta.path);
  const techStackLabel = resumeMode ? "techStack (package.json ∩ author usage)" : "techStackHints";

  if (profile.error) {
    return `### ${title}\n${jlgitMetaBlock}\nERROR: ${profile.error}`;
  }
  if (profile.recentCommits.length === 0) {
    const readmeRaw = profile.readmeExcerpt?.trim() ?? "";
    const readmeLimit = mode === "full" ? CONTEXT_README_CHARS : 800;
    const readmeExcerpt =
      readmeRaw.length > readmeLimit
        ? `${readmeRaw.slice(0, readmeLimit)}\n…[truncated]`
        : readmeRaw;
    return [
      `### ${title}`,
      jlgitMetaBlock,
      `repoFolderName: ${folderName}`,
      `projectId: ${profile.projectId}`,
      resumeMode ? "matchedCommits=0" : null,
      resumeMode ? "authorInvolvementRange: —" : null,
      `${techStackLabel}: ${profile.techStackHints.join(", ") || "—"}`,
      readmeExcerpt ? `readmeExcerpt:\n${readmeExcerpt}` : "readmeExcerpt: (none)",
      resumeMode
        ? "(no author-matched commit samples; still list this project when enumerating; do not invent personal contributions)"
        : "(no commit samples in snapshot; still list this project when enumerating)",
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
  }

  const subjectLimit =
    mode === "full"
      ? CONTEXT_SUBJECT_COMMITS_PER_PROJECT
      : Math.min(24, CONTEXT_SUBJECT_COMMITS_PER_PROJECT);
  const detailLimit = mode === "full" ? CONTEXT_DETAIL_COMMITS_PER_PROJECT : 3;
  const readmeLimit = mode === "full" ? CONTEXT_README_CHARS : 800;

  const subjectIndex = profile.recentCommits
    .slice(0, subjectLimit)
    .map((commit) => `- ${commit.authoredAt.slice(0, 10)} ${commit.shortId} ${commit.subject}`)
    .join("\n");

  const detailCommits = profile.recentCommits
    .slice(0, detailLimit)
    .map((commit) => formatCommitEvidence(commit, mode === "compact", resumeMode))
    .join("\n\n");

  const readmeRaw = profile.readmeExcerpt?.trim() ?? "";
  const readmeExcerpt =
    readmeRaw.length > readmeLimit ? `${readmeRaw.slice(0, readmeLimit)}\n…[truncated]` : readmeRaw;
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
    involvementStart && involvementEnd ? `${involvementStart} – ${involvementEnd}` : "—";

  return [
    `### ${title}`,
    jlgitMetaBlock,
    `repoFolderName: ${folderName}`,
    // 作者参与周期仅简历技能需要
    resumeMode ? `authorInvolvementRange: ${involvementRange}` : null,
    resumeMode ? `authorFirstCommitAt: ${profile.firstCommitAt ?? "—"}` : null,
    resumeMode ? `authorLastCommitAt: ${profile.lastCommitAt ?? "—"}` : null,
    resumeMode ? `matchedCommits=${profile.sampledCommitCount}` : null,
    `${techStackLabel}: ${profile.techStackHints.join(", ") || "—"}`,
    profile.packageTechStack && profile.packageTechStack.length > 0
      ? `packageTechCandidates: ${profile.packageTechStack.join(", ")}`
      : null,
    readmeBlock,
    "subjectIndex (cluster by theme; enough for approach bullets):",
    subjectIndex || "(none)",
    detailCommits ? `commitDetails (paths/excerpts when available):\n${detailCommits}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function repoFolderNameFromPath(path: string): string {
  const normalized = path.replace(/[\\/]+$/u, "");
  const parts = normalized.split(/[\\/]/u);
  return parts[parts.length - 1] || path;
}

/** 超预算时按仓库轮转截取，避免只保留前几个仓 */
function fairTruncateBlocks(header: string, blocks: readonly string[], budget: number): string {
  if (blocks.length === 0) {
    return `${header.slice(0, budget)}\n\n[truncated]`;
  }
  const overhead = header.length + 2;
  const perBlock = Math.max(1_200, Math.floor((budget - overhead) / blocks.length) - 8);
  const trimmed = blocks.map((block) =>
    block.length <= perBlock ? block : `${block.slice(0, perBlock)}\n…[project truncated]`,
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
  /** 普通对话不带作者邮箱，避免模型讨论「谁的提交」 */
  includeAuthorEmail = false,
): string {
  const head = includeAuthorEmail
    ? `- ${commit.authoredAt.slice(0, 10)} ${commit.shortId} <${commit.authorEmail}> ${commit.subject}`
    : `- ${commit.authoredAt.slice(0, 10)} ${commit.shortId} ${commit.subject}`;
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
      !pathsOnly && file.snippet ? `\n    code excerpt:\n${indentBlock(file.snippet, "    ")}` : "";
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
