import { getAgentKey } from "@/services/ai/ai.settings";
import { redactSecrets } from "@/services/ai/ai.sanitize";
import { getLog, getStatus, listBranches, listTree } from "@/services/git";

import i18n from "@/i18n";
import { isRecord, type AppError } from "@/types/error";
import type { AgentChatMessage } from "@/types/ai";
import type { GitBranch, GitCommitSummary, GitStatusResult } from "@/types/git";

const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_AGENT_MODEL = "deepseek-chat";
const AGENT_REQUEST_TIMEOUT_MS = 60_000;
const AGENT_HISTORY_LIMIT = 20;
const AGENT_LOG_LIMIT = 16;
const AGENT_FILE_LIMIT = 120;
const AGENT_STATUS_ENTRY_LIMIT = 50;
const AGENT_COMPARISON_LIMIT = 12;

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

  const repositoryContext = await buildRepositoryContext(
    repoPath,
    messages[messages.length - 1]?.content ?? "",
  );
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

function buildAgentSystemPrompt(locale: string, repositoryContext: string): string {
  const language = locale === "zh-CN" ? "Simplified Chinese" : "English";
  return [
    "You are 鲸灵, a helpful Git desktop assistant.",
    `Reply in ${language} unless the user explicitly requests another language.`,
    "You receive a read-only snapshot of the current repository for every request.",
    "Use only facts in the repository snapshot and the current project conversation.",
    "You can explain current status, branches, history, files, and a supplied branch comparison.",
    "Do not claim to have executed Git commands, changed files, or know file contents that are absent from the snapshot.",
    "For a comparison that is not supplied, ask the user to name the two branches exactly.",
    "Never reveal credentials or suggest destructive Git commands without explaining the impact.",
    "Keep answers concise, practical, and clearly state uncertainty.",
    "Current repository snapshot:",
    repositoryContext,
  ].join(" ");
}

async function buildRepositoryContext(repoPath: string, question: string): Promise<string> {
  const [statusResult, branchesResult, logResult, treeResult] = await Promise.allSettled([
    getStatus(repoPath),
    listBranches(repoPath, true),
    getLog(repoPath, { limit: AGENT_LOG_LIMIT }),
    listTree(repoPath, "HEAD"),
  ]);

  const sections = [
    formatStatusContext(statusResult),
    formatBranchesContext(branchesResult),
    formatLogContext(logResult, "Recent commits on HEAD"),
    formatTreeContext(treeResult),
  ];

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

  return redactSecrets(sections.join("\n\n"));
}

function formatStatusContext(result: PromiseSettledResult<GitStatusResult>): string {
  if (result.status === "rejected") {
    return "Repository status: unavailable.";
  }
  const status = result.value;
  const changes = status.entries
    .slice(0, AGENT_STATUS_ENTRY_LIMIT)
    .map((entry) => `${entry.indexStatus}${entry.worktreeStatus} ${entry.path}`);
  const omitted = status.entries.length - changes.length;
  return [
    "Repository status:",
    `- Current ref: ${status.detached ? "detached HEAD" : status.branch ?? "unknown"}`,
    `- Upstream: ${status.upstream ?? "none"}; ahead ${status.ahead}, behind ${status.behind}`,
    `- Working tree changes (${status.entries.length}):`,
    ...(changes.length > 0 ? changes.map((change) => `  - ${change}`) : ["  - clean"]),
    ...(omitted > 0 ? [`  - … ${omitted} more changes omitted`] : []),
  ].join("\n");
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
