import {
  getCommit,
  getCommitFileDiff,
  getLog,
  listTree,
  readWorktreeFile,
} from "@/services/git";
import {
  extractTechFromPackageJson,
  filterTechByAuthorUsage,
  mergePackageTech,
} from "@/services/agent/agent.techStack";
import type { Project } from "@/types/project";
import type {
  ResumeCommitChangedFile,
  ResumeCommitSample,
  AgentProjectProfile,
} from "@/types/agent";

/** git_log 单次硬上限 200 */
const LOG_PAGE_SIZE = 200;
/** 未配置作者时：全库近期窗口抽样上限 */
const LOG_SAMPLE_LIMIT = 400;
/** 已配置作者时：按 --author 分页拉取上限（他人提交不占预算） */
const AUTHOR_LOG_CAP = 500;
/** 时间分桶后写入画像 / 模型 subjectIndex 的提交上限 */
const AUTHOR_COMMIT_LIMIT = 48;
/** 时间分桶数量（覆盖职业生涯各阶段） */
const TIME_BUCKET_COUNT = 8;
/** 扫描并发压低，避免多仓同时打满机器 */
const PROFILE_CONCURRENCY = 1;

/** 每仓最多为多少条提交拉取代码证据（只读） */
const CODE_EVIDENCE_COMMIT_LIMIT = 6;
/** 为技术栈使用证据额外拉取改动路径的提交数 */
const TECH_PATH_COMMIT_LIMIT = 12;
/** 每条提交最多取样几个文件的 diff */
const CODE_EVIDENCE_FILES_PER_COMMIT = 2;
const CODE_DIFF_MAX_BYTES = 4_096;
const CODE_SNIPPET_MAX_CHARS = 1_200;
const CODE_ENRICH_CONCURRENCY = 1;
const PACKAGE_JSON_MAX_BYTES = 256_000;
const README_MAX_BYTES = 48_000;
const README_EXCERPT_CHARS = 3_500;

const SKIP_FILE_PATTERN =
  /(?:^|\/)(?:node_modules|dist|build|coverage|\.git)\//i;
const SKIP_FILE_NAME_PATTERN =
  /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|composer\.lock|Podfile\.lock|\.DS_Store)$/i;
const SKIP_BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|bz2|7z|rar|woff2?|ttf|eot|mp4|mov|webm|wasm|exe|dll|so|dylib|bin)$/i;

/** 无 package.json 时的非 JS 仓库兜底线索 */
const FALLBACK_TECH_FILES: ReadonlyArray<{ file: string; hint: string }> = [
  { file: "Cargo.toml", hint: "Rust" },
  { file: "go.mod", hint: "Go" },
  { file: "pom.xml", hint: "Java (Maven)" },
  { file: "build.gradle", hint: "Java/Kotlin (Gradle)" },
  { file: "build.gradle.kts", hint: "Kotlin (Gradle)" },
  { file: "requirements.txt", hint: "Python" },
  { file: "pyproject.toml", hint: "Python" },
  { file: "Gemfile", hint: "Ruby" },
  { file: "composer.json", hint: "PHP" },
  { file: "Podfile", hint: "iOS/CocoaPods" },
  { file: "pubspec.yaml", hint: "Flutter/Dart" },
  { file: "tauri.conf.json", hint: "Tauri" },
];

export interface AgentAuthorFilter {
  name: string;
  email: string;
}

/**
 * 并行汇总全部已登记仓库画像（限并发）。
 * 已配置作者时：`git log --author` 尽量全量拉取；发送前再时间分桶。
 * 未配置时：近期窗口抽样（兼容旧行为）。
 */
export async function buildAgentProfiles(
  projects: readonly Project[],
  authors: readonly AgentAuthorFilter[] = [],
): Promise<AgentProjectProfile[]> {
  const authorPatterns = toGitAuthorPatterns(authors);
  const results: AgentProjectProfile[] = new Array(projects.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < projects.length) {
      const index = cursor;
      cursor += 1;
      const project = projects[index];
      if (!project) continue;
      results[index] = await buildOneProfile(project, authorPatterns);
    }
  }

  const workers = Array.from(
    { length: Math.min(PROFILE_CONCURRENCY, Math.max(1, projects.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function normalizeAuthorFilters(
  authors: readonly AgentAuthorFilter[],
): ReadonlyArray<{ name: string; email: string }> {
  return authors
    .map((author) => ({
      name: author.name.trim().toLowerCase(),
      email: author.email.trim().toLowerCase(),
    }))
    .filter((author) => author.name || author.email);
}

/**
 * 按多个 Git 作者过滤各仓提交摘要（命中任一账号即保留）。
 * 已配置作者时：无匹配提交的仓库直接丢弃（用于串行成稿等需证据的路径）。
 */
export function filterProfilesByAuthor(
  profiles: readonly AgentProjectProfile[],
  authors: readonly AgentAuthorFilter[],
): AgentProjectProfile[] {
  return prepareProfilesForAgentContext(profiles, authors).filter(
    (profile) =>
      !profile.error && profile.recentCommits.length > 0,
  );
}

/**
 * 多仓对话上下文：保留全部已登记仓库，不因「无本人提交」丢弃。
 * 提交摘要仍按 Git 作者收窄（可为空），供列举项目与按需成稿。
 */
export function prepareProfilesForAgentContext(
  profiles: readonly AgentProjectProfile[],
  authors: readonly AgentAuthorFilter[],
): AgentProjectProfile[] {
  const filters = normalizeAuthorFilters(authors);

  return profiles.map((profile) => {
    if (profile.error) {
      return profile;
    }

    if (filters.length === 0) {
      if (profile.recentCommits.length === 0) {
        return {
          ...profile,
          recentCommits: [],
          sampledCommitCount: 0,
          firstCommitAt: null,
          lastCommitAt: null,
        };
      }
      const sampled = selectTimeBucketedCommits(
        profile.recentCommits,
        AUTHOR_COMMIT_LIMIT,
      );
      return {
        ...profile,
        recentCommits: sampled,
        sampledCommitCount: sampled.length,
        firstCommitAt: earliestAuthoredAt(profile.recentCommits),
        lastCommitAt: latestAuthoredAt(profile.recentCommits),
      };
    }

    const matched = profile.recentCommits.filter((commit) =>
      filters.some((filter) => commitMatchesAuthor(commit, filter)),
    );
    if (matched.length === 0) {
      return {
        ...profile,
        recentCommits: [],
        sampledCommitCount: 0,
        firstCommitAt: null,
        lastCommitAt: null,
      };
    }

    const sampled = selectTimeBucketedCommits(matched, AUTHOR_COMMIT_LIMIT);
    return {
      ...profile,
      recentCommits: sampled,
      sampledCommitCount: sampled.length,
      firstCommitAt: minIsoDate(
        profile.firstCommitAt,
        earliestAuthoredAt(matched),
      ),
      lastCommitAt: maxIsoDate(
        profile.lastCommitAt,
        latestAuthoredAt(matched),
      ),
    };
  });
}

/**
 * 将 `--author` 用的正则特殊字符转义；优先邮箱，否则姓名。
 */
export function toGitAuthorPatterns(
  authors: readonly AgentAuthorFilter[],
): string[] {
  const patterns: string[] = [];
  for (const author of authors) {
    const email = author.email.trim();
    const name = author.name.trim();
    if (email) {
      patterns.push(escapeGitAuthorRegex(email));
    } else if (name) {
      patterns.push(escapeGitAuthorRegex(name));
    }
  }
  return [...new Set(patterns)];
}

function escapeGitAuthorRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 按时间分桶均匀抽样，覆盖早期→近期各阶段（非仅最近窗口）。
 * 返回按 authoredAt 从新到旧。
 */
export function selectTimeBucketedCommits<T extends { id: string; authoredAt: string }>(
  commits: readonly T[],
  limit: number,
): T[] {
  if (limit <= 0 || commits.length === 0) {
    return [];
  }
  if (commits.length <= limit) {
    return [...commits].sort((a, b) => b.authoredAt.localeCompare(a.authoredAt));
  }

  const sorted = [...commits].sort((a, b) =>
    a.authoredAt.localeCompare(b.authoredAt),
  );
  const bucketCount = Math.min(TIME_BUCKET_COUNT, limit, sorted.length);
  const basePerBucket = Math.floor(limit / bucketCount);
  let remainder = limit % bucketCount;
  const picked: T[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < bucketCount; i += 1) {
    const start = Math.floor((i / bucketCount) * sorted.length);
    const end = Math.floor(((i + 1) / bucketCount) * sorted.length);
    const bucket = sorted.slice(start, Math.max(start + 1, end));
    const take = basePerBucket + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
    for (const commit of pickEvenlySpaced(bucket, take)) {
      if (seen.has(commit.id)) continue;
      seen.add(commit.id);
      picked.push(commit);
    }
  }

  // 若分桶未凑满（极端重复时间戳等），用全局均匀补齐
  if (picked.length < limit) {
    for (const commit of pickEvenlySpaced(sorted, limit)) {
      if (seen.has(commit.id)) continue;
      seen.add(commit.id);
      picked.push(commit);
      if (picked.length >= limit) break;
    }
  }

  return picked
    .slice(0, limit)
    .sort((a, b) => b.authoredAt.localeCompare(a.authoredAt));
}

/** 在序列内均匀取 n 个（含首尾），保序 */
function pickEvenlySpaced<T>(items: readonly T[], count: number): T[] {
  if (count <= 0 || items.length === 0) {
    return [];
  }
  if (count >= items.length) {
    return [...items];
  }
  if (count === 1) {
    return [items[Math.floor(items.length / 2)]!];
  }
  const result: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i * (items.length - 1)) / (count - 1));
    result.push(items[index]!);
  }
  return result;
}

function earliestAuthoredAt(
  commits: readonly ResumeCommitSample[],
): string | null {
  let earliest: string | null = null;
  for (const commit of commits) {
    if (!commit.authoredAt) continue;
    if (!earliest || commit.authoredAt < earliest) {
      earliest = commit.authoredAt;
    }
  }
  return earliest;
}

function latestAuthoredAt(
  commits: readonly ResumeCommitSample[],
): string | null {
  let latest: string | null = null;
  for (const commit of commits) {
    if (!commit.authoredAt) continue;
    if (!latest || commit.authoredAt > latest) {
      latest = commit.authoredAt;
    }
  }
  return latest;
}

function minIsoDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxIsoDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * 为过滤后的提交补充只读代码证据（改动文件 + diff 摘录）。
 * 仅调用查询类 Git Command，不执行任何写操作。
 */
export async function enrichProfilesWithCodeEvidence(
  profiles: readonly AgentProjectProfile[],
): Promise<AgentProjectProfile[]> {
  const results: AgentProjectProfile[] = new Array(profiles.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < profiles.length) {
      const index = cursor;
      cursor += 1;
      const profile = profiles[index];
      if (!profile) continue;
      results[index] = await enrichOneProfile(profile);
    }
  }

  const workers = Array.from(
    {
      length: Math.min(CODE_ENRICH_CONCURRENCY, Math.max(1, profiles.length)),
    },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function commitMatchesAuthor(
  commit: { authorName: string; authorEmail: string },
  filter: { name: string; email: string },
): boolean {
  const commitName = commit.authorName.toLowerCase();
  const commitEmail = commit.authorEmail.toLowerCase();
  const nameOk =
    !filter.name || commitName.includes(filter.name) || filter.name.includes(commitName);
  const emailOk =
    !filter.email ||
    commitEmail === filter.email ||
    commitEmail.includes(filter.email);
  return (filter.name ? nameOk : true) && (filter.email ? emailOk : true);
}

async function buildOneProfile(
  project: Project,
  authorPatterns: readonly string[],
): Promise<AgentProjectProfile> {
  try {
    const [logCommits, treeResult] = await Promise.all([
      loadSampledLogCommits(project.path, authorPatterns),
      listTree(project.path, "HEAD").catch(() => ({ paths: [] as string[] })),
    ]);

    // 构建阶段先保留作者侧全量（或近期窗口），发送前再分桶/二次过滤
    const commits: ResumeCommitSample[] = logCommits.map((commit) => ({
      id: commit.id,
      shortId: commit.shortId,
      subject: commit.subject,
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
      authoredAt: commit.authoredAt,
    }));

    const range = await resolveAuthorInvolvementRange(
      project.path,
      authorPatterns,
      commits,
    );

    const [packageTechStack, readme] = await Promise.all([
      loadPackageTechStack(project.path, treeResult.paths),
      loadReadmeExcerpt(project.path, treeResult.paths),
    ]);
    const fallbackTech = inferFallbackTechHints(treeResult.paths);
    // 作者使用过滤在 enrich 后完成；此处先用 package 主栈占位
    const techStackHints =
      packageTechStack.length > 0 ? packageTechStack : fallbackTech;

    return {
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      firstCommitAt: range.firstCommitAt,
      lastCommitAt: range.lastCommitAt,
      sampledCommitCount: commits.length,
      packageTechStack,
      techStackHints,
      readmePath: readme?.path,
      readmeExcerpt: readme?.excerpt,
      recentCommits: commits,
    };
  } catch (error) {
    return {
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      error: error instanceof Error ? error.message : String(error),
      firstCommitAt: null,
      lastCommitAt: null,
      sampledCommitCount: 0,
      techStackHints: [],
      packageTechStack: [],
      recentCommits: [],
    };
  }
}

type LogCommitRow = {
  id: string;
  shortId: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
};

/**
 * 分页拉取提交。
 * - 有作者模式：`git log --all --author=...`，累计到 AUTHOR_LOG_CAP
 * - 无作者：近期窗口到 LOG_SAMPLE_LIMIT
 */
async function loadSampledLogCommits(
  repoPath: string,
  authorPatterns: readonly string[],
): Promise<LogCommitRow[]> {
  const cap =
    authorPatterns.length > 0 ? AUTHOR_LOG_CAP : LOG_SAMPLE_LIMIT;
  const commits: LogCommitRow[] = [];
  let skip = 0;

  while (commits.length < cap) {
    const limit = Math.min(LOG_PAGE_SIZE, cap - commits.length);
    const page = await getLog(repoPath, {
      limit,
      skip,
      all: true,
      authors:
        authorPatterns.length > 0 ? [...authorPatterns] : undefined,
    });
    if (page.commits.length === 0) {
      break;
    }
    commits.push(...page.commits);
    if (!page.hasMore) {
      break;
    }
    skip += page.commits.length;
  }

  return commits;
}

/**
 * 作者参与周期：末次取抽样中最新；有作者时再用 --reverse 精确取最早接手时间
 * （避免 AUTHOR_LOG_CAP 截断导致「开始时间」偏晚）。
 */
async function resolveAuthorInvolvementRange(
  repoPath: string,
  authorPatterns: readonly string[],
  commits: readonly ResumeCommitSample[],
): Promise<{ firstCommitAt: string | null; lastCommitAt: string | null }> {
  let firstCommitAt = earliestAuthoredAt(commits);
  let lastCommitAt = latestAuthoredAt(commits);

  if (authorPatterns.length === 0 || commits.length === 0) {
    return { firstCommitAt, lastCommitAt };
  }

  try {
    const oldestPage = await getLog(repoPath, {
      limit: 1,
      skip: 0,
      all: true,
      reverse: true,
      authors: [...authorPatterns],
    });
    const oldestAt = oldestPage.commits[0]?.authoredAt;
    if (oldestAt) {
      firstCommitAt = minIsoDate(firstCommitAt, oldestAt);
    }
  } catch {
    // 精确最早提交失败时回退抽样窗口内最早值
  }

  return { firstCommitAt, lastCommitAt };
}

async function enrichOneProfile(
  profile: AgentProjectProfile,
): Promise<AgentProjectProfile> {
  if (profile.error || !profile.projectPath || profile.recentCommits.length === 0) {
    return profile;
  }

  const repoPath = profile.projectPath;
  // 证据提交也按时间分桶，避免只抽最近几条
  const targets = selectTimeBucketedCommits(
    profile.recentCommits,
    CODE_EVIDENCE_COMMIT_LIMIT,
  );
  const enrichedList = await Promise.all(
    targets.map((commit) => enrichCommit(repoPath, commit)),
  );
  const enrichedById = new Map(
    enrichedList.map((commit) => [commit.id, commit] as const),
  );
  const recentCommits = profile.recentCommits.map(
    (commit) => enrichedById.get(commit.id) ?? commit,
  );

  // 额外收集更多提交的改动路径，用于判断作者实际用过哪些技术
  const pathCommits = selectTimeBucketedCommits(
    recentCommits,
    TECH_PATH_COMMIT_LIMIT,
  );
  const extraPaths = await collectTouchedPaths(repoPath, pathCommits);

  const paths = new Set<string>(extraPaths);
  const texts: string[] = [];
  for (const commit of recentCommits) {
    for (const file of commit.changedFiles ?? []) {
      paths.add(file.path);
      if (file.snippet) {
        texts.push(file.snippet);
      }
    }
  }

  const packageTech = profile.packageTechStack ?? [];
  const techStackHints = filterTechByAuthorUsage(packageTech, {
    paths: [...paths],
    texts,
    subjects: recentCommits.map((commit) => commit.subject),
  });

  return {
    ...profile,
    recentCommits,
    techStackHints:
      techStackHints.length > 0 ? techStackHints : profile.techStackHints,
  };
}

/** 读取根目录 README 摘录，供项目名/简介判断 */
async function loadReadmeExcerpt(
  repoPath: string,
  treePaths: readonly string[],
): Promise<{ path: string; excerpt: string } | null> {
  const readmePath = pickReadmePath(treePaths);
  if (!readmePath) {
    return null;
  }
  try {
    const result = await readWorktreeFile(repoPath, readmePath, {
      maxBytes: README_MAX_BYTES,
    });
    if (result.binary) {
      return null;
    }
    const text = result.text.replace(/\r\n/g, "\n").trim();
    if (!text) {
      return null;
    }
    const excerpt =
      text.length > README_EXCERPT_CHARS
        ? `${text.slice(0, README_EXCERPT_CHARS)}\n…[truncated]`
        : text;
    return { path: readmePath, excerpt };
  } catch {
    return null;
  }
}

function pickReadmePath(treePaths: readonly string[]): string | null {
  const rootReadmes = treePaths.filter((path) => {
    if (path.includes("/")) return false;
    return /^readme(?:\.[a-z0-9._-]+)?$/i.test(path);
  });
  if (rootReadmes.length === 0) {
    return null;
  }
  const rank = (name: string): number => {
    const lower = name.toLowerCase();
    if (lower === "readme.md") return 0;
    if (lower === "readme.zh-cn.md" || lower === "readme.zh.md") return 1;
    if (lower.startsWith("readme.") && lower.endsWith(".md")) return 2;
    if (lower === "readme") return 3;
    return 4;
  };
  rootReadmes.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return rootReadmes[0] ?? null;
}

/** 读取仓库内 package.json（根目录 + 浅层 packages/*），解析主技术栈候选 */
async function loadPackageTechStack(
  repoPath: string,
  treePaths: readonly string[],
): Promise<string[]> {
  const candidates = pickPackageJsonPaths(treePaths);
  if (candidates.length === 0) {
    return [];
  }

  const lists = await Promise.all(
    candidates.map(async (filePath) => {
      try {
        const result = await readWorktreeFile(repoPath, filePath, {
          maxBytes: PACKAGE_JSON_MAX_BYTES,
        });
        if (result.binary || !result.text.trim()) {
          return [] as string[];
        }
        return extractTechFromPackageJson(result.text);
      } catch {
        return [] as string[];
      }
    }),
  );

  return mergePackageTech(lists);
}

function pickPackageJsonPaths(treePaths: readonly string[]): string[] {
  const matches = treePaths.filter((path) => {
    if (!/(^|\/)package\.json$/i.test(path)) return false;
    if (SKIP_FILE_PATTERN.test(path)) return false;
    const depth = path.split("/").length;
    // 根 package.json，或 packages/foo/package.json 一层
    return depth <= 3;
  });
  // 根优先
  matches.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  return matches.slice(0, 5);
}

/** 只读收集提交改动路径（不拉 diff），供技术栈使用判定 */
async function collectTouchedPaths(
  repoPath: string,
  commits: readonly ResumeCommitSample[],
): Promise<string[]> {
  const paths = new Set<string>();
  for (const commit of commits) {
    if (commit.changedFiles && commit.changedFiles.length > 0) {
      for (const file of commit.changedFiles) {
        paths.add(file.path);
      }
      continue;
    }
    try {
      const { commit: detail } = await getCommit(repoPath, commit.id);
      for (const file of detail.diffs[0]?.files ?? []) {
        if (isInterestingPath(file.path)) {
          paths.add(file.path);
        }
      }
    } catch {
      // 单条失败忽略
    }
  }
  return [...paths];
}

async function enrichCommit(
  repoPath: string,
  commit: ResumeCommitSample,
): Promise<ResumeCommitSample> {
  if (commit.changedFiles && commit.changedFiles.length > 0) {
    return commit;
  }

  try {
    const { commit: detail } = await getCommit(repoPath, commit.id);
    const parentDiff = detail.diffs[0];
    const parentRev = parentDiff?.parentId;
    const interesting = (parentDiff?.files ?? []).filter((file) =>
      isInterestingPath(file.path),
    );
    // 前 N 个拉 diff 摘录；其余只保留路径供技术栈使用判定
    const filesForDiff = interesting.slice(0, CODE_EVIDENCE_FILES_PER_COMMIT);
    const pathOnly = interesting.slice(CODE_EVIDENCE_FILES_PER_COMMIT);

    const changedFiles: ResumeCommitChangedFile[] = [];
    for (const file of filesForDiff) {
      const base: ResumeCommitChangedFile = {
        path: file.path,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
      };
      try {
        const diff = await getCommitFileDiff(repoPath, {
          filePath: file.path,
          commitRev: commit.id,
          parentRev: parentRev || undefined,
          maxBytes: CODE_DIFF_MAX_BYTES,
        });
        if (diff.binary) {
          changedFiles.push({ ...base, snippet: "[binary omitted]" });
          continue;
        }
        const raw = (diff.patch || diff.newText || "").trim();
        if (!raw) {
          changedFiles.push(base);
          continue;
        }
        changedFiles.push({
          ...base,
          snippet: truncateSnippet(raw),
        });
      } catch {
        changedFiles.push(base);
      }
    }

    for (const file of pathOnly) {
      changedFiles.push({
        path: file.path,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
      });
    }

    return { ...commit, changedFiles };
  } catch {
    return commit;
  }
}

function isInterestingPath(path: string): boolean {
  if (!path.trim()) return false;
  if (SKIP_FILE_PATTERN.test(path)) return false;
  if (SKIP_FILE_NAME_PATTERN.test(path)) return false;
  if (SKIP_BINARY_EXT.test(path)) return false;
  return true;
}

function truncateSnippet(text: string): string {
  if (text.length <= CODE_SNIPPET_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, CODE_SNIPPET_MAX_CHARS)}\n…[truncated]`;
}

function inferFallbackTechHints(paths: readonly string[]): string[] {
  const hints = new Set<string>();
  const rootFiles = new Set(
    paths
      .filter((path) => !path.includes("/"))
      .map((path) => path.toLowerCase()),
  );

  for (const { file, hint } of FALLBACK_TECH_FILES) {
    if (rootFiles.has(file.toLowerCase())) {
      hints.add(hint);
    }
  }

  return [...hints].slice(0, 8);
}
