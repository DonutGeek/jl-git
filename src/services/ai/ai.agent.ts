import { getAgentKey } from "@/services/ai/ai.settings";
import { redactSecrets } from "@/services/ai/ai.sanitize";
import { buildAgentSystemPrompt } from "@/prompts/agent";
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
import type {
  GitBranch,
  GitCommitDetail,
  GitCommitSummary,
  GitStatusResult,
} from "@/types/git";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_AGENT_MODEL = "deepseek-chat";
const AGENT_REQUEST_TIMEOUT_MS = 60_000;
const AGENT_HISTORY_LIMIT = 20;
const AGENT_LOG_LIMIT = 16;
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
  signal?: AbortSignal;
  onDelta: (content: string) => void;
}

/**
 * 从 DeepSeek 流式读取当前项目会话的回复。
 * 会话由调用方按项目隔离后传入，本服务不读取其它项目的消息。
 */
export async function streamAgentReply({
  messages,
  repoPath,
  locale,
  signal,
  onDelta,
}: StreamAgentReplyOptions): Promise<void> {
  const apiKey = await getAgentKey();
  if (!apiKey) {
    throw appError("VALIDATION", i18n.t("ai.errors.missingApiKey"));
  }

  const repositoryContext = await buildRepositoryContext(repoPath, messages);
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
            content: buildAgentSystemPrompt(locale, repositoryContext),
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

async function buildRepositoryContext(
  repoPath: string,
  messages: readonly AgentChatMessage[],
): Promise<string> {
  const question = messages[messages.length - 1]?.content ?? "";
  const selectedBranches = messages[messages.length - 1]?.mentions
    ?.filter((mention) => mention.type === "branch")
    .map((mention) => mention.name) ?? [];
  const needFileTree = needsFileTreeContext(question);
  const needWorkingTreePatches = needsWorkingTreePatchContext(question);

  const [statusResult, branchesResult, logResult, treeResult] = await Promise.allSettled([
    getStatus(repoPath),
    listBranches(repoPath, true),
    getLog(repoPath, { limit: AGENT_LOG_LIMIT }),
    needFileTree
      ? listTree(repoPath, "HEAD")
      : Promise.resolve({ paths: [] as string[] }),
  ]);

  const sections = [
    formatStatusContext(statusResult),
    formatBranchesContext(branchesResult),
    formatLogContext(logResult, "Recent commits on HEAD"),
    needFileTree ? formatTreeContext(treeResult) : null,
    selectedBranches.length > 0
      ? `User-selected branch references: ${selectedBranches.join(", ")}.`
      : null,
  ];

  if (
    needWorkingTreePatches &&
    statusResult.status === "fulfilled"
  ) {
    const workingTreePatches = await readWorkingTreePatches(
      repoPath,
      statusResult.value,
    );
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
    const commitContext = await buildCommitContext(repoPath, question, messages, logResult.value.commits);
    if (commitContext) {
      sections.push(commitContext);
    }
  }

  return redactSecrets(sections.filter((section): section is string => section !== null).join("\n\n"));
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
    `- Current ref: ${status.detached ? "detached HEAD" : status.branch ?? "unknown"}`,
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
    (commit) => `- ${commit.shortId} ${commit.subject} (${commit.authorName}, ${commit.authoredAt})`,
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
    const matched = commits.filter((commit) =>
      commit.id.toLowerCase().startsWith(reference) || commit.shortId.toLowerCase().startsWith(reference),
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

  return patches.length > 0
    ? ["Selected working-tree patches:", ...patches].join("\n\n")
    : null;
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
  return /(?:主要.*(?:干什么|做了什么)|具体.*(?:改|内容)|怎么改|diff|差异|实现|逻辑|代码)/i.test(question);
}

async function readCommitPatches(repoPath: string, detail: GitCommitDetail): Promise<string | null> {
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
