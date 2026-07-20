import { getCommit, getCommitFileDiff, getLog, listTree } from "@/services/git";
import type { Project } from "@/types/project";
import type {
  ResumeCommitChangedFile,
  ResumeCommitSample,
  ResumeProjectProfile,
} from "@/types/resumeHelper";

const LOG_SAMPLE_LIMIT = 80;
const AUTHOR_COMMIT_LIMIT = 24;
const PROFILE_CONCURRENCY = 3;

/** 每仓最多为多少条提交拉取代码证据（只读） */
const CODE_EVIDENCE_COMMIT_LIMIT = 5;
/** 每条提交最多取样几个文件的 diff */
const CODE_EVIDENCE_FILES_PER_COMMIT = 2;
const CODE_DIFF_MAX_BYTES = 4_096;
const CODE_SNIPPET_MAX_CHARS = 1_200;
const CODE_ENRICH_CONCURRENCY = 2;

const SKIP_FILE_PATTERN =
  /(?:^|\/)(?:node_modules|dist|build|coverage|\.git)\//i;
const SKIP_FILE_NAME_PATTERN =
  /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|composer\.lock|Podfile\.lock|\.DS_Store)$/i;
const SKIP_BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|bz2|7z|rar|woff2?|ttf|eot|mp4|mov|webm|wasm|exe|dll|so|dylib|bin)$/i;

const TECH_FILE_HINTS: ReadonlyArray<{ file: string; hint: string }> = [
  { file: "package.json", hint: "JavaScript/TypeScript (Node)" },
  { file: "pnpm-lock.yaml", hint: "pnpm" },
  { file: "yarn.lock", hint: "Yarn" },
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
  { file: "next.config.js", hint: "Next.js" },
  { file: "next.config.mjs", hint: "Next.js" },
  { file: "vite.config.ts", hint: "Vite" },
  { file: "vite.config.js", hint: "Vite" },
];

const TECH_DIR_HINTS: ReadonlyArray<{ dir: string; hint: string }> = [
  { dir: "src/", hint: "src layout" },
  { dir: "app/", hint: "app router / application root" },
  { dir: "android/", hint: "Android" },
  { dir: "ios/", hint: "iOS" },
  { dir: "crates/", hint: "Rust workspace" },
  { dir: "packages/", hint: "monorepo packages" },
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

/** 按多个 Git 作者过滤各仓提交摘要（命中任一账号即保留） */
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
    return profiles.map((profile) => ({
      ...profile,
      recentCommits: profile.recentCommits.slice(0, AUTHOR_COMMIT_LIMIT),
    }));
  }

  return profiles.map((profile) => {
    if (profile.error) {
      return profile;
    }
    const matched = profile.recentCommits
      .filter((commit) => filters.some((filter) => commitMatchesAuthor(commit, filter)))
      .slice(0, AUTHOR_COMMIT_LIMIT);
    return {
      ...profile,
      recentCommits: matched,
      sampledCommitCount: matched.length,
    };
  });
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
    const [logResult, treeResult] = await Promise.all([
      getLog(project.path, { limit: LOG_SAMPLE_LIMIT, all: true }),
      listTree(project.path, "HEAD").catch(() => ({ paths: [] as string[] })),
    ]);

    const commits: ResumeCommitSample[] = logResult.commits.map((commit) => ({
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

    return {
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      firstCommitAt,
      lastCommitAt,
      sampledCommitCount: commits.length,
      techStackHints: inferTechHints(treeResult.paths),
      recentCommits: commits.slice(0, AUTHOR_COMMIT_LIMIT),
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
      recentCommits: [],
    };
  }
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

  return {
    ...profile,
    recentCommits: [
      ...enriched,
      ...profile.recentCommits.slice(CODE_EVIDENCE_COMMIT_LIMIT),
    ],
  };
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
    const files = (parentDiff?.files ?? [])
      .filter((file) => isInterestingPath(file.path))
      .slice(0, CODE_EVIDENCE_FILES_PER_COMMIT);

    const changedFiles: ResumeCommitChangedFile[] = [];
    for (const file of files) {
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

function inferTechHints(paths: readonly string[]): string[] {
  const hints = new Set<string>();
  const rootFiles = new Set(
    paths
      .filter((path) => !path.includes("/"))
      .map((path) => path.toLowerCase()),
  );

  for (const { file, hint } of TECH_FILE_HINTS) {
    if (rootFiles.has(file.toLowerCase())) {
      hints.add(hint);
    }
  }

  const pathSet = new Set(paths.map((path) => path.toLowerCase()));
  for (const { dir, hint } of TECH_DIR_HINTS) {
    const prefix = dir.toLowerCase();
    if ([...pathSet].some((path) => path === prefix.slice(0, -1) || path.startsWith(prefix))) {
      hints.add(hint);
    }
  }

  return [...hints].slice(0, 12);
}
