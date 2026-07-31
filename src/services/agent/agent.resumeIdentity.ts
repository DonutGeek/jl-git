import i18n from "@/i18n";
import type { AgentAuthorFilter } from "@/services/agent/agent.profile";
import { getGlobalIdentity, getIdentity } from "@/services/git/git.identity";
import type { AgentChatMessage } from "@/types/ai";
import type { GitIdentity } from "@/types/git";

export const RESUME_IDENTITY_REQUIRED_MARKER = "<!-- jlgit-resume:identity-required -->";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const NAME_EMAIL_PAIR_PATTERN =
  /(?:^|[\s,，;；])([^<>\n,，;；]{1,48})\s*<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>/gi;
const AUTHOR_NAME_PATTERNS = [
  /(?:(?:我的?\s*)(?:Git\s*)?(?:作者名|提交作者|提交名|用户名)\s*(?:是|为|[:：=])|(?:Git\s*)?(?:作者名|提交作者|提交名|用户名)\s*[:：=])\s*([^\n,，;；<>]{1,64})/giu,
  /(?:(?:my\s+)(?:git\s+)?(?:author(?:\s+name)?|user\s+name)\s*(?:is|[:=])|(?:git\s+)?(?:author(?:\s+name)?|user\s+name)\s*[:=])\s*([^\n,;<>]{1,64})/giu,
] as const;

/** 仓库 / 全局均未配置身份时由应用追问（可声明或去设置配置）。 */
export function buildResumeIdentityRequest(locale: string): string {
  const message = i18n.t("agent.resumeIdentityRequired", { lng: locale });
  return `${message}\n\n${RESUME_IDENTITY_REQUIRED_MARKER}`;
}

/** 将 git config 生效身份转为简历作者过滤器（name / email 至少一个非空）。 */
export function authorsFromGitIdentity(
  identity: GitIdentity | null | undefined,
): AgentAuthorFilter[] {
  const name = identity?.name?.trim() ?? "";
  const email = identity?.email?.trim() ?? "";
  if (!name && !email) {
    return [];
  }
  return [{ name, email }];
}

/**
 * 解析简历作者：优先对话中主动声明（可覆盖），否则读 Git 身份。
 * - 单仓：当前仓库生效身份（本地覆盖 + 全局）
 * - 多仓：全局身份；若为空再试 `fallbackRepoPaths` 中首个有配置的仓
 */
export async function resolveResumeAuthors(
  messages: readonly AgentChatMessage[],
  options?: { repoPath?: string | null; fallbackRepoPaths?: readonly string[] },
): Promise<AgentAuthorFilter[]> {
  const declared = extractDeclaredResumeAuthors(messages);
  if (declared.length > 0) {
    return declared;
  }

  try {
    if (options?.repoPath) {
      return authorsFromGitIdentity(await getIdentity(options.repoPath));
    }

    const fromGlobal = authorsFromGitIdentity(await getGlobalIdentity());
    if (fromGlobal.length > 0) {
      return fromGlobal;
    }

    for (const path of options?.fallbackRepoPaths ?? []) {
      const trimmed = path.trim();
      if (!trimmed) {
        continue;
      }
      const fromRepo = authorsFromGitIdentity(await getIdentity(trimmed));
      if (fromRepo.length > 0) {
        return fromRepo;
      }
    }
  } catch {
    // 读身份失败时交给上层追问，不抛到对话流
  }
  return [];
}

/**
 * 解析用户主动声明的 Git 作者名 / 提交邮箱（用于覆盖自动识别的身份）。
 */
export function parseDeclaredResumeAuthors(content: string): AgentAuthorFilter[] {
  const paired: AgentAuthorFilter[] = [];
  const pairedEmails = new Set<string>();

  for (const match of content.matchAll(NAME_EMAIL_PAIR_PATTERN)) {
    const name = cleanDeclaredName(match[1] ?? "");
    const email = (match[2] ?? "").trim().toLowerCase();
    if (!email) {
      continue;
    }
    paired.push({ name, email });
    pairedEmails.add(email);
  }

  const names: string[] = [];
  for (const pattern of AUTHOR_NAME_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const name = cleanDeclaredName(match[1] ?? "");
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }
  }

  const emails = [
    ...new Set((content.match(EMAIL_PATTERN) ?? []).map((email) => email.toLowerCase())),
  ].filter((email) => !pairedEmails.has(email));

  const declared = [...paired];
  const pairCount = Math.min(names.length, emails.length);
  for (let index = 0; index < pairCount; index += 1) {
    declared.push({
      name: names[index] ?? "",
      email: emails[index] ?? "",
    });
  }
  for (const name of names.slice(pairCount)) {
    declared.push({ name, email: "" });
  }
  for (const email of emails.slice(pairCount)) {
    declared.push({ name: "", email });
  }

  return dedupeAuthors(declared);
}

/** 使用最近一次明确声明，允许用户在后续消息中更正作者身份。 */
export function extractDeclaredResumeAuthors(
  messages: readonly AgentChatMessage[],
): AgentAuthorFilter[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }
    const declared = parseDeclaredResumeAuthors(message.content);
    if (
      declared.length > 0 &&
      (hasIdentityDeclarationCue(message.content) ||
        hasPendingResumeIdentityRequest(messages.slice(0, index + 1)))
    ) {
      return declared;
    }
  }
  return [];
}

/** 上一条助手消息是否正在等待简历作者身份。 */
export function hasPendingResumeIdentityRequest(messages: readonly AgentChatMessage[]): boolean {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex <= 0) {
    return false;
  }
  for (let index = lastUserIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message.content.includes(RESUME_IDENTITY_REQUIRED_MARKER);
    }
  }
  return false;
}

function cleanDeclaredName(value: string): string {
  return value
    .trim()
    .replace(
      /^(?:(?:我是|我叫|my\s+name\s+is)|(?:(?:我的?\s*)?(?:Git\s*)?(?:作者名|提交作者|提交名|用户名)\s*(?:是|为|[:：=])))\s*/iu,
      "",
    )
    .trim()
    .slice(0, 64);
}

function hasIdentityDeclarationCue(content: string): boolean {
  return /(?:我的?\s*)(?:Git\s*)?(?:作者名|提交作者|提交名|用户名|提交邮箱|邮箱)\s*(?:是|为|[:：=])|(?:Git\s*)?(?:作者名|提交作者|提交名|用户名|提交邮箱|邮箱)\s*[:：=]|(?:my\s+)(?:git\s+)?(?:author(?:\s+name)?|user\s+name|commit\s+email|email)\s*(?:is|[:=])|(?:git\s+)?(?:author(?:\s+name)?|user\s+name|commit\s+email|email)\s*[:=]|<[^>\s]+@[^>\s]+>/iu.test(
    content,
  );
}

function dedupeAuthors(authors: readonly AgentAuthorFilter[]): AgentAuthorFilter[] {
  const seen = new Set<string>();
  const result: AgentAuthorFilter[] = [];
  for (const author of authors) {
    const name = author.name.trim();
    const email = author.email.trim().toLowerCase();
    if (!name && !email) {
      continue;
    }
    const key = `${name.toLowerCase()}\u0000${email}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ name, email });
  }
  return result;
}
