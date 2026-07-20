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
} from "@/services/resume/resume.techStack";
import type { Project } from "@/types/project";
import type {
  ResumeCommitChangedFile,
  ResumeCommitSample,
  ResumeProjectProfile,
} from "@/types/resumeHelper";

/** git_log 单次硬上限 200；分页累加到此总量 */
const LOG_PAGE_SIZE = 200;
const LOG_SAMPLE_LIMIT = 400;
const AUTHOR_COMMIT_LIMIT = 48;
const PROFILE_CONCURRENCY = 3;

/** 每仓最多为多少条提交拉取代码证据（只读） */
const CODE_EVIDENCE_COMMIT_LIMIT = 8;
/** 为技术栈使用证据额外拉取改动路径的提交数 */
const TECH_PATH_COMMIT_LIMIT = 24;
/** 每条提交最多取样几个文件的 diff */
const CODE_EVIDENCE_FILES_PER_COMMIT = 2;
const CODE_DIFF_MAX_BYTES = 4_096;
const CODE_SNIPPET_MAX_CHARS = 1_200;
const CODE_ENRICH_CONCURRENCY = 2;
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

/**
 * 并行汇总全部已登记仓库画像（限并发）。
 * 时间范围为抽样窗口内最早/最晚提交，非全库精确首 commit（MVP）。
 */
export async function buildResumeProfiles(
  projects: readonly Project[],
): Promise<ResumeProjectProfile[]> {
  const results: ResumeProjectProfile[] = new Array(projects.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < projects.length) {
      const index = cursor;
      cursor += 1;
      const project = projects[index];
      if (!project) continue;
      results[index] = await buildOneProfile(project);
    }
  }

  const workers = Array.from(
    { length: Math.min(PROFILE_CONCURRENCY, Math.max(1, projects.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export interface ResumeAuthorFilter {
  name: string;
  email: string;
}

/**
 * 按多个 Git 作者过滤各仓提交摘要（命中任一账号即保留）。
 * 已配置作者时：无匹配提交的仓库直接丢弃，不进入简历上下文。
 */
export function filterProfilesByAuthor(
  profiles: readonly ResumeProjectProfile[],
  authors: readonly ResumeAuthorFilter[],
): ResumeProjectProfile[] {
  const filters = authors
    .map((author) => ({
      name: author.name.trim().toLowerCase(),
      email: author.email.trim().toLowerCase(),
    }))
    .filter((author) => author.name || author.email);

  if (filters.length === 0) {
    // 未配置作者时仍只保留有抽样提交的仓，避免空仓进成稿
    return profiles
      .filter((profile) => !profile.error && profile.recentCommits.length > 0)
      .map((profile) => ({
        ...profile,
        recentCommits: profile.recentCommits.slice(0, AUTHOR_COMMIT_LIMIT),
        sampledCommitCount: Math.min(
          profile.recentCommits.length,
          AUTHOR_COMMIT_LIMIT,
        ),
      }));
  }

  const next: ResumeProjectProfile[] = [];
  for (const profile of profiles) {
    if (profile.error) {
      continue;
    }
    const matched = profile.recentCommits
      .filter((commit) =>
        filters.some((filter) => commitMatchesAuthor(commit, filter)),
      )
      .slice(0, AUTHOR_COMMIT_LIMIT);
    if (matched.length === 0) {
      continue;
    }
    next.push({
      ...profile,
      recentCommits: matched,
      sampledCommitCount: matched.length,
      firstCommitAt: earliestAuthoredAt(matched),
      lastCommitAt: latestAuthoredAt(matched),
    });
  }
  return next;
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

/**
 * 为过滤后的提交补充只读代码证据（改动文件 + diff 摘录）。
 * 仅调用查询类 Git Command，不执行任何写操作。
 */
export async function enrichProfilesWithCodeEvidence(
  profiles: readonly ResumeProjectProfile[],
): Promise<ResumeProjectProfile[]> {
  const results: ResumeProjectProfile[] = new Array(profiles.length);
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

async function buildOneProfile(project: Project): Promise<ResumeProjectProfile> {
  try {
    const [logCommits, treeResult] = await Promise.all([
      loadSampledLogCommits(project.path),
      listTree(project.path, "HEAD").catch(() => ({ paths: [] as string[] })),
    ]);

    const commits: ResumeCommitSample[] = logCommits.map((commit) => ({
      id: commit.id,
      shortId: commit.shortId,
      subject: commit.subject,
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
      authoredAt: commit.authoredAt,
    }));

    let firstCommitAt: string | null = null;
    let lastCommitAt: string | null = null;
    for (const commit of commits) {
      if (!commit.authoredAt) continue;
      if (!firstCommitAt || commit.authoredAt < firstCommitAt) {
        firstCommitAt = commit.authoredAt;
      }
      if (!lastCommitAt || commit.authoredAt > lastCommitAt) {
        lastCommitAt = commit.authoredAt;
      }
    }

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
      firstCommitAt,
      lastCommitAt,
      sampledCommitCount: commits.length,
      packageTechStack,
      techStackHints,
      readmePath: readme?.path,
      readmeExcerpt: readme?.excerpt,
      // 保留抽样窗口内全部提交，供作者匹配后再截断
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

/** 分页拉取抽样提交（单次 ≤200，累计到 LOG_SAMPLE_LIMIT） */
async function loadSampledLogCommits(repoPath: string): Promise<
  Array<{
    id: string;
    shortId: string;
    subject: string;
    authorName: string;
    authorEmail: string;
    authoredAt: string;
  }>
> {
  const commits: Array<{
    id: string;
    shortId: string;
    subject: string;
    authorName: string;
    authorEmail: string;
    authoredAt: string;
  }> = [];
  let skip = 0;

  while (commits.length < LOG_SAMPLE_LIMIT) {
    const limit = Math.min(LOG_PAGE_SIZE, LOG_SAMPLE_LIMIT - commits.length);
    const page = await getLog(repoPath, { limit, skip, all: true });
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
async function enrichOneProfile(
  profile: ResumeProjectProfile,
): Promise<ResumeProjectProfile> {
  if (profile.error || !profile.projectPath || profile.recentCommits.length === 0) {
    return profile;
  }

  const repoPath = profile.projectPath;
  const targets = profile.recentCommits.slice(0, CODE_EVIDENCE_COMMIT_LIMIT);
  const enriched = await Promise.all(
    targets.map((commit) => enrichCommit(repoPath, commit)),
  );
  const recentCommits = [
    ...enriched,
    ...profile.recentCommits.slice(CODE_EVIDENCE_COMMIT_LIMIT),
  ];

  // 额外收集更多提交的改动路径，用于判断作者实际用过哪些技术
  const pathCommits = recentCommits.slice(0, TECH_PATH_COMMIT_LIMIT);
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
