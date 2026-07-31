import { getAgentKey } from "@/services/ai/ai.settings";
import { mapDeepSeekHttpError } from "@/services/ai/ai.httpError";
import { DEFAULT_AGENT_MODEL } from "@/services/ai/ai.models";
import { redactSecrets } from "@/services/ai/ai.sanitize";
import { getAgentSafetyRefusal } from "@/services/ai/ai.safety";
import { getAgentSkillMode } from "@/services/ai/ai.skillMode";
import { runAgentCodeToolLoop, shouldEnableAgentCodeTools } from "@/services/ai/ai.toolLoop";
import {
  buildResumeIdentityRequest,
  resolveResumeAuthors,
} from "@/services/agent/agent.resumeIdentity";
import { formatJlgitMetaBlock, toGitAuthorPatterns } from "@/services/agent/agent.profile";
import { buildAgentSystemPrompt } from "@/prompts/agent";
import { buildResumeSystemPrompt } from "@/prompts/resume";
import { buildSkillCreatorSystemPrompt } from "@/prompts/skillCreator";
import {
  getCommit,
  getCommitFileDiff,
  getDiff,
  getLog,
  getStatus,
  listBranches,
  listTree,
} from "@/services/git";

import i18n from "@/i18n";
import { isRecord, type AppError } from "@/types/error";
import type { AgentChatMessage } from "@/types/ai";
import type { AgentJlgitMeta } from "@/types/agent";
import type { GitBranch, GitCommitDetail, GitCommitSummary, GitStatusResult } from "@/types/git";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
const AGENT_REQUEST_TIMEOUT_MS = 150_000;
const AGENT_HISTORY_LIMIT = 20;
const AGENT_LOG_LIMIT = 16;
const RESUME_LOG_LIMIT = 200;
const AGENT_FILE_LIMIT = 120;
const AGENT_STATUS_ENTRY_LIMIT = 50;
const AGENT_COMPARISON_LIMIT = 12;
const AGENT_COMMIT_FILE_LIMIT = 80;
const AGENT_COMMIT_PATCH_FILE_LIMIT = 6;
const AGENT_COMMIT_PATCH_BYTES = 4_096;
const AGENT_WORKING_TREE_PATCH_FILE_LIMIT = 6;
const AGENT_WORKING_TREE_PATCH_BYTES = 4_096;
const COMMIT_REFERENCE_PATTERN = /\b[0-9a-f]{7,64}\b/gi;

interface StreamAgentReplyOptions {
  messages: readonly AgentChatMessage[];
  repoPath: string;
  locale: string;
  /** 鲸灵Git 登记信息（别名 / 详情等），优先于 README 识别项目 */
  jlgitMeta?: AgentJlgitMeta;
  signal?: AbortSignal;
  /** DeepSeek model id，如 deepseek-v4-pro / deepseek-v4-flash */
  model?: string;
  /** 关闭时同模型禁用 thinking，无 reasoning 流 */
  enableThinking?: boolean;
  onDelta: (content: string) => void;
  /** DeepSeek thinking 的 reasoning_content 增量 */
  onReasoningDelta?: (content: string) => void;
}

/**
 * 从 DeepSeek 流式读取当前项目会话的回复。
 * 会话由调用方按项目隔离后传入，本服务不读取其它项目的消息。
 */
export async function streamAgentReply({
  messages,
  repoPath,
  locale,
  jlgitMeta,
  signal,
  model = DEFAULT_AGENT_MODEL,
  enableThinking = true,
  onDelta,
  onReasoningDelta,
}: StreamAgentReplyOptions): Promise<void> {
  const safetyRefusal = getAgentSafetyRefusal(messages, locale);
  if (safetyRefusal) {
    onDelta(safetyRefusal);
    return;
  }

  const skillMode = getAgentSkillMode(messages);
  const resumeMode = skillMode === "resume";
  const resumeAuthors = resumeMode ? await resolveResumeAuthors(messages, { repoPath }) : [];
  if (resumeMode && resumeAuthors.length === 0) {
    onDelta(buildResumeIdentityRequest(locale));
    return;
  }

  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const repositoryContext = await buildRepositoryContext(
    repoPath,
    messages,
    resumeMode ? resumeAuthors : [],
    skillMode === "skill-creator",
    jlgitMeta,
  );
  const systemPrompt =
    skillMode === "resume"
      ? buildResumeSystemPrompt(locale, repositoryContext)
      : skillMode === "skill-creator"
        ? buildSkillCreatorSystemPrompt(locale, repositoryContext)
        : buildAgentSystemPrompt(locale, repositoryContext);
  const controller = new AbortController();
  const abortFromCaller = (): void => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = window.setTimeout(() => controller.abort(), AGENT_REQUEST_TIMEOUT_MS);
  const modelId = model.trim() || DEFAULT_AGENT_MODEL;
  const history = messages.slice(-AGENT_HISTORY_LIMIT).map((message) => ({
    role: message.role,
    content: redactSecrets(message.content),
  }));
  const temperature = skillMode === "resume" ? 0.55 : skillMode === "skill-creator" ? 0.45 : 0.3;
  const enableCodeTools = shouldEnableAgentCodeTools({
    skillMode,
    allowedRepos: [{ path: repoPath, label: jlgitMeta?.alias }],
  });

  try {
    if (enableCodeTools) {
      await runAgentCodeToolLoop({
        apiKey,
        model: modelId,
        systemPrompt,
        history,
        allowedRepos: [{ path: repoPath, label: jlgitMeta?.alias }],
        multiRepo: false,
        temperature,
        signal: controller.signal,
        failureMessage: i18n.t("agent.replyFailed"),
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
        // 成稿类技能略高；通用 Git 问答更克制
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
          // 只回传正文；reasoning 仅 UI 展示，不进入下一轮上下文
          ...history,
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await readResponseJson(response);
      throw mapDeepSeekHttpError(response.status, payload, i18n.t("agent.replyFailed"));
    }
    if (!response.body) {
      throw appError("INTERNAL", i18n.t("agent.replyFailed"));
    }

    await readSseStream(response.body, onDelta, onReasoningDelta);
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

async function buildRepositoryContext(
  repoPath: string,
  messages: readonly AgentChatMessage[],
  resumeAuthors: ReadonlyArray<{ name: string; email: string }> = [],
  forceFileTree = false,
  jlgitMeta?: AgentJlgitMeta,
): Promise<string> {
  const question = messages[messages.length - 1]?.content ?? "";
  const selectedBranches =
    messages[messages.length - 1]?.mentions
      ?.filter((mention) => mention.type === "branch")
      .map((mention) => mention.name) ?? [];
  const resumeAuthorPatterns = toGitAuthorPatterns(resumeAuthors);
  const resumeMode = resumeAuthorPatterns.length > 0;
  const needFileTree = resumeMode || forceFileTree || needsFileTreeContext(question);
  const needWorkingTreePatches = needsWorkingTreePatchContext(question);

  const [statusResult, branchesResult, logResult, oldestAuthorCommitResult, treeResult] =
    await Promise.allSettled([
      getStatus(repoPath),
      listBranches(repoPath, true),
      getLog(
        repoPath,
        resumeMode
          ? {
              limit: RESUME_LOG_LIMIT,
              all: true,
              authors: resumeAuthorPatterns,
            }
          : { limit: AGENT_LOG_LIMIT },
      ),
      resumeMode
        ? getLog(repoPath, {
            limit: 1,
            all: true,
            reverse: true,
            authors: resumeAuthorPatterns,
          })
        : Promise.resolve({ commits: [] as GitCommitSummary[], hasMore: false }),
      needFileTree
        ? listTree(repoPath, "HEAD")
        : Promise.resolve({ paths: [] as string[], truncated: false }),
    ]);

  const sections = [
    jlgitMeta ? formatJlgitMetaBlock(jlgitMeta) : `repoPath: ${repoPath}`,
    resumeMode
      ? [
          "userGitAuthors（优先用户声明，否则来自当前仓库生效的 user.name / user.email）：",
          ...resumeAuthors.map(
            (author) => `- ${author.name.trim() || "—"} <${author.email.trim() || "—"}>`,
          ),
          "Only commits matched by these author filters are personal contribution evidence.",
        ].join("\n")
      : null,
    formatStatusContext(statusResult),
    formatBranchesContext(branchesResult),
    formatLogContext(
      logResult,
      resumeMode ? "Author-matched commits across all refs" : "Recent commits on HEAD",
    ),
    resumeMode ? formatResumeInvolvementContext(logResult, oldestAuthorCommitResult) : null,
    needFileTree ? formatTreeContext(treeResult) : null,
    selectedBranches.length > 0
      ? `User-selected branch references: ${selectedBranches.join(", ")}.`
      : null,
  ];

  if (needWorkingTreePatches && statusResult.status === "fulfilled") {
    const workingTreePatches = await readWorkingTreePatches(repoPath, statusResult.value);
    if (workingTreePatches) {
      sections.push(workingTreePatches);
    }
  }

  if (branchesResult.status === "fulfilled") {
    const currentBranch =
      statusResult.status === "fulfilled" && !statusResult.value.detached
        ? statusResult.value.branch
        : null;
    const comparison = await buildBranchComparisonContext(
      repoPath,
      question,
      branchesResult.value,
      currentBranch,
    );
    if (comparison) {
      sections.push(comparison);
    }
  }

  if (logResult.status === "fulfilled") {
    const commitContext = await buildCommitContext(
      repoPath,
      question,
      messages,
      logResult.value.commits,
    );
    if (commitContext) {
      sections.push(commitContext);
    }
  }

  return redactSecrets(
    sections.filter((section): section is string => section !== null).join("\n\n"),
  );
}

function formatResumeInvolvementContext(
  recent: PromiseSettledResult<{
    commits: GitCommitSummary[];
    hasMore: boolean;
  }>,
  oldest: PromiseSettledResult<{
    commits: GitCommitSummary[];
    hasMore: boolean;
  }>,
): string {
  if (recent.status === "rejected" || recent.value.commits.length === 0) {
    return "matchedCommits=0\nauthorInvolvementRange: —";
  }
  const latestAt = recent.value.commits[0]?.authoredAt ?? null;
  const oldestAt =
    oldest.status === "fulfilled"
      ? (oldest.value.commits[0]?.authoredAt ?? null)
      : (recent.value.commits[recent.value.commits.length - 1]?.authoredAt ?? null);
  const start = formatResumeMonth(oldestAt);
  const end = formatResumeMonth(latestAt);
  return [
    `matchedCommits=${recent.value.commits.length}${recent.value.hasMore ? "+" : ""}`,
    `authorInvolvementRange: ${start && end ? `${start} – ${end}` : "—"}`,
  ].join("\n");
}

function formatResumeMonth(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  return match ? `${match[1]}.${match[2]}` : null;
}

function formatStatusContext(result: PromiseSettledResult<GitStatusResult>): string {
  if (result.status === "rejected") {
    return "Repository status: unavailable.";
  }
  const status = result.value;
  const changes = status.entries.slice(0, AGENT_STATUS_ENTRY_LIMIT).map((entry) => {
    const sides: string[] = [];
    if (entry.indexStatus !== "." && entry.indexStatus !== "?") {
      sides.push(`staged:${describeGitLetter(entry.indexStatus)}`);
    }
    if (entry.worktreeStatus === "?") {
      sides.push("untracked");
    } else if (entry.worktreeStatus !== ".") {
      sides.push(`unstaged:${describeGitLetter(entry.worktreeStatus)}`);
    }
    const sideLabel = sides.length > 0 ? sides.join(", ") : "changed";
    return `  - ${entry.path} (${sideLabel})`;
  });
  const omitted = status.entries.length - changes.length;
  return [
    "Repository status:",
    `- Current ref: ${status.detached ? "detached HEAD" : (status.branch ?? "unknown")}`,
    `- Upstream: ${status.upstream ?? "none"}; ahead ${status.ahead}, behind ${status.behind}`,
    `- Working tree changes (${status.entries.length}):`,
    ...(changes.length > 0 ? changes : ["  - clean"]),
    ...(omitted > 0 ? [`  - … ${omitted} more changes omitted`] : []),
  ].join("\n");
}

/** 将 Git 单字母状态转成快照可读标签，避免模型把 .M 原样念给用户 */
function describeGitLetter(letter: string): string {
  switch (letter) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "U":
      return "unmerged";
    default:
      return letter;
  }
}

function formatBranchesContext(result: PromiseSettledResult<GitBranch[]>): string {
  if (result.status === "rejected") {
    return "Branches: unavailable.";
  }
  const branches = result.value.map((branch) => {
    const flags = [
      branch.isCurrent ? "current" : null,
      branch.isDefault ? "default" : null,
      branch.isRemote ? "remote" : "local",
      branch.upstream ? `upstream=${branch.upstream}` : null,
    ].filter(Boolean);
    return `- ${branch.name} (${flags.join(", ")})`;
  });
  return ["Branches:", ...(branches.length > 0 ? branches : ["- none"])].join("\n");
}

function formatLogContext(
  result: PromiseSettledResult<{ commits: GitCommitSummary[]; hasMore: boolean }>,
  title: string,
): string {
  if (result.status === "rejected") {
    return `${title}: unavailable.`;
  }
  const commits = result.value.commits.map(
    (commit) =>
      `- ${commit.shortId} ${commit.subject} (${commit.authorName}, ${commit.authoredAt})`,
  );
  return [
    `${title}:`,
    ...(commits.length > 0 ? commits : ["- no commits"]),
    ...(result.value.hasMore ? ["- … more commits omitted"] : []),
  ].join("\n");
}

function formatTreeContext(result: PromiseSettledResult<{ paths: string[] }>): string {
  if (result.status === "rejected") {
    return "Files at HEAD: unavailable.";
  }
  const paths = result.value.paths.slice(0, AGENT_FILE_LIMIT);
  return [
    `Files at HEAD (${result.value.paths.length}):`,
    ...(paths.length > 0 ? paths.map((path) => `- ${path}`) : ["- none"]),
    ...(result.value.paths.length > paths.length
      ? [`- … ${result.value.paths.length - paths.length} more files omitted`]
      : []),
  ].join("\n");
}

async function buildBranchComparisonContext(
  repoPath: string,
  question: string,
  branches: readonly GitBranch[],
  currentBranch: string | null,
): Promise<string | null> {
  const mentioned = branches
    .map((branch) => branch.name)
    .filter((name) => question.includes(name))
    .sort((left, right) => question.indexOf(left) - question.indexOf(right));
  if (
    currentBranch &&
    /(?:当前分支|current\s+branch)/i.test(question) &&
    !mentioned.includes(currentBranch)
  ) {
    mentioned.unshift(currentBranch);
  }
  const uniqueBranches = [...new Set(mentioned)].slice(0, 2);
  if (uniqueBranches.length !== 2) {
    return null;
  }

  const [base, target] = uniqueBranches;
  const [targetOnly, baseOnly] = await Promise.allSettled([
    getLog(repoPath, { ref: `${base}..${target}`, limit: AGENT_COMPARISON_LIMIT }),
    getLog(repoPath, { ref: `${target}..${base}`, limit: AGENT_COMPARISON_LIMIT }),
  ]);
  return [
    `Branch comparison: ${base} ↔ ${target}.`,
    formatLogContext(targetOnly, `Commits only on ${target}`),
    formatLogContext(baseOnly, `Commits only on ${base}`),
  ].join("\n");
}

/**
 * 对话中的提交问答按需读取真实提交详情，避免模型仅根据标题猜测改动内容。
 * 只允许匹配当前快照中的近期提交，防止将用户输入直接作为 Git 引用执行。
 */
async function buildCommitContext(
  repoPath: string,
  question: string,
  messages: readonly AgentChatMessage[],
  commits: readonly GitCommitSummary[],
): Promise<string | null> {
  const commit = findMentionedCommit(question, messages, commits);
  if (!commit) {
    return null;
  }

  try {
    const detail = (await getCommit(repoPath, commit.id)).commit;
    const sections = [formatCommitDetail(detail)];
    if (shouldIncludeCommitPatches(question)) {
      const patches = await readCommitPatches(repoPath, detail);
      if (patches) {
        sections.push(patches);
      }
    }
    return sections.join("\n");
  } catch {
    return `Commit details for ${commit.shortId}: unavailable.`;
  }
}

function findMentionedCommit(
  question: string,
  messages: readonly AgentChatMessage[],
  commits: readonly GitCommitSummary[],
): GitCommitSummary | null {
  if (isLatestCommitQuestion(question)) {
    return commits[0] ?? null;
  }
  if (!hasCommitFollowUpIntent(question)) {
    return null;
  }

  const references = extractCommitReferences(messages);
  for (const reference of references) {
    const matched = commits.filter(
      (commit) =>
        commit.id.toLowerCase().startsWith(reference) ||
        commit.shortId.toLowerCase().startsWith(reference),
    );
    if (matched.length === 1) {
      return matched[0];
    }
  }
  return null;
}

function hasWorkingTreeChangeIntent(question: string): boolean {
  return /(?:当前|现在|工作区|未提交|暂存)?.{0,12}(?:变更|修改|改了|改动|changes?)|(?:变更|修改|改动|diff|差异).{0,12}(?:什么|哪些|内容|文件)|what(?:'s| is| are)?.{0,12}chang/i.test(
    question,
  );
}

/** 仅在用户追问行级细节时拉工作区 patch，避免普通「改了什么」被多文件 diff 拖慢发送 */
function needsWorkingTreePatchContext(question: string): boolean {
  return (
    hasWorkingTreeChangeIntent(question) &&
    /(?:具体|逐行|细节|怎么改|改哪|diff|差异|patch|代码|实现|逻辑)/i.test(question)
  );
}

function needsFileTreeContext(question: string): boolean {
  return /(?:文件列表|有哪些文件|目录树|仓库里有|list\s+files|file\s+tree|project\s+files)/i.test(
    question,
  );
}

async function readWorkingTreePatches(
  repoPath: string,
  status: GitStatusResult,
): Promise<string | null> {
  const targets = status.entries
    .flatMap((entry) => {
      const items: { path: string; staged: boolean }[] = [];
      if (entry.indexStatus !== "." && entry.indexStatus !== "?") {
        items.push({ path: entry.path, staged: true });
      }
      if (entry.worktreeStatus === "?" || entry.worktreeStatus !== ".") {
        items.push({ path: entry.path, staged: false });
      }
      return items;
    })
    .slice(0, AGENT_WORKING_TREE_PATCH_FILE_LIMIT);

  if (targets.length === 0) {
    return null;
  }

  const results = await Promise.allSettled(
    targets.map(async (target) => ({
      target,
      diff: await getDiff(repoPath, {
        filePath: target.path,
        staged: target.staged,
        maxBytes: AGENT_WORKING_TREE_PATCH_BYTES,
      }),
    })),
  );

  const patches = results.flatMap((result) => {
    if (result.status !== "fulfilled" || !result.value.diff.patch.trim()) {
      return [];
    }
    const { target, diff } = result.value;
    const side = target.staged ? "staged" : "unstaged";
    const suffix = diff.truncated ? "\n[patch truncated]" : "";
    return [`Patch (${side}) for ${target.path}:\n${diff.patch}${suffix}`];
  });

  return patches.length > 0 ? ["Selected working-tree patches:", ...patches].join("\n\n") : null;
}

function isLatestCommitQuestion(question: string): boolean {
  return /(?:最近|最新|上一次|上次|latest|last)\s*(?:一次)?\s*(?:提交|commit)|(?:提交|commit).{0,8}(?:最近|最新|latest|last)/i.test(
    question,
  );
}

function hasCommitFollowUpIntent(question: string): boolean {
  return /(?:提交|commit|这次|这一个|这个|里面|改了|哪些文件|具体|内容|详情|diff|差异|变更)/i.test(
    question,
  );
}

function extractCommitReferences(messages: readonly AgentChatMessage[]): string[] {
  const references: string[] = [];
  for (const message of [...messages].reverse()) {
    const matches = message.content.match(COMMIT_REFERENCE_PATTERN) ?? [];
    for (const match of matches) {
      const reference = match.toLowerCase();
      if (!references.includes(reference)) {
        references.push(reference);
      }
    }
  }
  return references;
}

function formatCommitDetail(detail: GitCommitDetail): string {
  const parentDiffs = detail.diffs.map((parentDiff) => ({
    parentShortId: parentDiff.parentShortId || "root",
    files: parentDiff.files.slice(0, AGENT_COMMIT_FILE_LIMIT),
    omitted: Math.max(0, parentDiff.files.length - AGENT_COMMIT_FILE_LIMIT),
  }));
  return [
    `Commit details: ${detail.shortId} ${detail.subject}`,
    detail.body ? `Commit message body: ${detail.body}` : null,
    `Author: ${detail.authorName}; authored at ${detail.authoredAt}.`,
    ...parentDiffs.flatMap((parentDiff) => [
      `Changed files against ${parentDiff.parentShortId} (${parentDiff.files.length + parentDiff.omitted}):`,
      ...parentDiff.files.map((file) => {
        const stats =
          file.additions == null && file.deletions == null
            ? ""
            : ` (+${file.additions ?? 0}/-${file.deletions ?? 0})`;
        return `- ${file.status} ${file.path}${stats}`;
      }),
      ...(parentDiff.omitted > 0 ? [`- … ${parentDiff.omitted} more files omitted`] : []),
    ]),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function shouldIncludeCommitPatches(question: string): boolean {
  return /(?:主要.*(?:干什么|做了什么)|具体.*(?:改|内容)|怎么改|diff|差异|实现|逻辑|代码)/i.test(
    question,
  );
}

async function readCommitPatches(
  repoPath: string,
  detail: GitCommitDetail,
): Promise<string | null> {
  const firstParent = detail.diffs[0];
  if (!firstParent) {
    return null;
  }
  const files = firstParent.files.slice(0, AGENT_COMMIT_PATCH_FILE_LIMIT);
  const results = await Promise.allSettled(
    files.map(async (file) => ({
      file,
      diff: await getCommitFileDiff(repoPath, {
        filePath: file.path,
        commitRev: detail.id,
        parentRev: firstParent.parentId || undefined,
        maxBytes: AGENT_COMMIT_PATCH_BYTES,
      }),
    })),
  );
  const patches = results.flatMap((result) => {
    if (result.status !== "fulfilled" || !result.value.diff.patch.trim()) {
      return [];
    }
    const suffix = result.value.diff.truncated ? "\n[patch truncated]" : "";
    return [`Patch for ${result.value.file.path}:\n${result.value.diff.patch}${suffix}`];
  });
  return patches.length > 0 ? ["Selected commit patches:", ...patches].join("\n\n") : null;
}

async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: (content: string) => void,
  onReasoningDelta?: (content: string) => void,
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
      buffer = consumeSseLines(buffer, onDelta, onReasoningDelta);
    }
    consumeSseLines(`${buffer}\n`, onDelta, onReasoningDelta);
  } finally {
    reader.releaseLock();
  }
}

function consumeSseLines(
  buffer: string,
  onDelta: (content: string) => void,
  onReasoningDelta?: (content: string) => void,
): string {
  let lineEnd = buffer.indexOf("\n");
  while (lineEnd >= 0) {
    const line = buffer.slice(0, lineEnd).trim();
    buffer = buffer.slice(lineEnd + 1);
    if (line.startsWith("data:")) {
      const data = line.slice(5).trim();
      if (data && data !== "[DONE]") {
        applySseDelta(data, onDelta, onReasoningDelta);
      }
    }
    lineEnd = buffer.indexOf("\n");
  }
  return buffer;
}

function applySseDelta(
  data: string,
  onDelta: (content: string) => void,
  onReasoningDelta?: (content: string) => void,
): void {
  try {
    const payload: unknown = JSON.parse(data);
    if (!isRecord(payload) || !Array.isArray(payload.choices)) {
      return;
    }
    for (const choice of payload.choices) {
      if (!isRecord(choice) || !isRecord(choice.delta)) {
        continue;
      }
      const delta = choice.delta;
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
    }
  } catch {
    // 忽略残缺 SSE 行
  }
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
