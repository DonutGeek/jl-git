import {
  AGENT_CODE_LIST_MAX_ENTRIES,
  AGENT_CODE_READ_MAX_BYTES,
  AGENT_CODE_SEARCH_MAX_MATCHES,
  assertAgentReadablePath,
  isDeniedAgentPath,
  normalizeAgentRelativePath,
} from "@/services/agent/agent.codePolicy";
import { redactSecrets } from "@/services/ai/ai.sanitize";
import { getFileSize, listDir, readWorktreeFile, searchCode } from "@/api/git";
import { toUserMessage } from "@/types/error";

export interface AgentCodeToolRepo {
  /** 绝对路径 */
  path: string;
  /** 展示名（多仓时写入结果） */
  label?: string;
}

export interface AgentToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AgentToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** DeepSeek / OpenAI 兼容 tools 定义（只读） */
export function buildAgentCodeToolDefinitions(multiRepo: boolean): AgentToolDefinition[] {
  const repoParam = multiRepo
    ? {
        repo_path: {
          type: "string",
          description:
            "Absolute path of the target registered repository (must match an allowed root from the snapshot).",
        },
      }
    : {};

  const requireRepo = multiRepo ? ["repo_path"] : [];

  return [
    {
      type: "function",
      function: {
        name: "list_dir",
        description:
          "List one level of entries under a relative directory inside the allowed repository. Use to explore project structure.",
        parameters: {
          type: "object",
          properties: {
            ...repoParam,
            relative: {
              type: "string",
              description: 'Relative directory from repo root. Empty or "." for root.',
            },
          },
          required: requireRepo,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_file",
        description:
          "Read a text source file from the allowed repository (size-capped). Do not use for secrets, .env, keys, or binaries.",
        parameters: {
          type: "object",
          properties: {
            ...repoParam,
            path: {
              type: "string",
              description: "Relative file path from repo root.",
            },
          },
          required: [...requireRepo, "path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_code",
        description:
          "Fixed-string search across the allowed repository (git grep). Use to locate features, pages, or symbols.",
        parameters: {
          type: "object",
          properties: {
            ...repoParam,
            pattern: {
              type: "string",
              description: "Literal search string (not regex).",
            },
            pathspec: {
              type: "string",
              description: "Optional relative path or directory to narrow the search.",
            },
          },
          required: [...requireRepo, "pattern"],
        },
      },
    },
  ];
}

export async function executeAgentCodeTool(
  call: AgentToolCall,
  allowedRepos: readonly AgentCodeToolRepo[],
): Promise<string> {
  try {
    if (allowedRepos.length === 0) {
      return redactSecrets(
        JSON.stringify({
          error:
            "No repository is unlocked for code tools. In multi-repo mode, @mention a project first.",
        }),
      );
    }

    const args = parseToolArgs(call.function.arguments);
    const repo = resolveToolRepo(args, allowedRepos);
    if (!repo) {
      return redactSecrets(
        JSON.stringify({
          error: "Repository not allowed. Use a path from the registered snapshot / @project.",
        }),
      );
    }

    switch (call.function.name) {
      case "list_dir":
        return redactSecrets(await runListDir(repo, args));
      case "read_file":
        return redactSecrets(await runReadFile(repo, args));
      case "search_code":
        return redactSecrets(await runSearchCode(repo, args));
      default:
        return redactSecrets(JSON.stringify({ error: `Unknown tool: ${call.function.name}` }));
    }
  } catch (error) {
    return redactSecrets(JSON.stringify({ error: toUserMessage(error) }));
  }
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

function readString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function resolveToolRepo(
  args: Record<string, unknown>,
  allowedRepos: readonly AgentCodeToolRepo[],
): AgentCodeToolRepo | null {
  if (allowedRepos.length === 1) {
    const only = allowedRepos[0];
    return only ?? null;
  }
  const requested = readString(args, "repo_path")?.trim();
  if (!requested) {
    return null;
  }
  const normalizedRequest = normalizePathKey(requested);
  return allowedRepos.find((repo) => normalizePathKey(repo.path) === normalizedRequest) ?? null;
}

function normalizePathKey(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

async function runListDir(repo: AgentCodeToolRepo, args: Record<string, unknown>): Promise<string> {
  const relative = normalizeAgentRelativePath(readString(args, "relative") ?? "");
  if (relative == null) {
    throw new Error("路径必须相对仓库根且不得包含 ..");
  }
  if (relative && isDeniedAgentPath(relative)) {
    throw new Error("该路径受保护，拒绝浏览");
  }
  const result = await listDir(repo.path, relative);
  const entries = result.entries
    .filter((entry) => !isDeniedAgentPath(entry.path))
    .slice(0, AGENT_CODE_LIST_MAX_ENTRIES)
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      isDir: entry.isDir,
    }));
  return JSON.stringify({
    repo: repo.label ?? repo.path,
    relative: relative || ".",
    entries,
    truncated: result.entries.length > entries.length,
  });
}

async function runReadFile(
  repo: AgentCodeToolRepo,
  args: Record<string, unknown>,
): Promise<string> {
  const path = assertAgentReadablePath(readString(args, "path") ?? "");
  if (!path) {
    throw new Error("缺少文件路径");
  }
  const size = await getFileSize(repo.path, path);
  if (size.size != null && size.size > AGENT_CODE_READ_MAX_BYTES) {
    throw new Error(`文件过大（>${AGENT_CODE_READ_MAX_BYTES} 字节），请缩小范围或换用 search_code`);
  }
  const file = await readWorktreeFile(repo.path, path, { maxBytes: AGENT_CODE_READ_MAX_BYTES });
  if (file.binary) {
    throw new Error("二进制文件不可读");
  }
  return JSON.stringify({
    repo: repo.label ?? repo.path,
    path,
    truncated: file.truncated,
    text: file.text,
  });
}

async function runSearchCode(
  repo: AgentCodeToolRepo,
  args: Record<string, unknown>,
): Promise<string> {
  const pattern = (readString(args, "pattern") ?? "").trim();
  if (!pattern) {
    throw new Error("搜索关键字不能为空");
  }
  let pathspec: string | undefined;
  const rawPathspec = readString(args, "pathspec");
  if (rawPathspec != null && rawPathspec.trim()) {
    pathspec = assertAgentReadablePath(rawPathspec);
  }
  const result = await searchCode(repo.path, pattern, {
    pathspec,
    maxMatches: AGENT_CODE_SEARCH_MAX_MATCHES,
  });
  const matches = result.matches.filter((item) => !isDeniedAgentPath(item.path));
  return JSON.stringify({
    repo: repo.label ?? repo.path,
    pattern,
    pathspec: pathspec ?? null,
    matches,
    truncated: result.truncated || matches.length < result.matches.length,
  });
}
