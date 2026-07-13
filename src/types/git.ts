export interface GitStatusResult {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  detached: boolean;
  entries: GitStatusEntry[];
}

/** 当前仓库生效的 Git 提交身份 */
export interface GitIdentity {
  name: string | null;
  email: string | null;
}

export interface GitStatusEntry {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  renamedFrom?: string;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
}

export interface GitCommitSummary {
  id: string;
  shortId: string;
  authorName: string;
  authoredAt: string;
  subject: string;
  /** 指向该提交的分支 / 标签（已清洗） */
  refs: string[];
}

export interface GitChangedFile {
  path: string;
  status: string;
}

export interface GitCommitParentDiff {
  parentId: string;
  parentShortId: string;
  files: GitChangedFile[];
}

export interface GitCommitDetail {
  id: string;
  shortId: string;
  authorName: string;
  authoredAt: string;
  subject: string;
  body: string;
  parents: string[];
  parentShortIds: string[];
  diffs: GitCommitParentDiff[];
}

export interface GitShowResult {
  commit: GitCommitDetail;
}

export interface GitLogResult {
  commits: GitCommitSummary[];
  hasMore: boolean;
}

export interface OkResult {
  ok: boolean;
}

export interface GitFetchResult {
  ok: boolean;
  remote: string;
  /** 耗时（毫秒） */
  elapsedMs: number;
}

export interface GitPullResult {
  ok: boolean;
  remote: string;
  elapsedMs: number;
}

export interface GitPushResult {
  ok: boolean;
  remote: string;
  elapsedMs: number;
}

export interface GitBranchesResult {
  branches: GitBranch[];
}

export interface GitCommitResult {
  commitId: string;
}

export interface GitDiffOptions {
  filePath: string;
  staged?: boolean;
  maxBytes?: number;
  /** 文本解码编码 id，见 TEXT_ENCODING_OPTIONS */
  encoding?: string;
}

export interface GitDiffResult {
  oldText: string;
  newText: string;
  patch: string;
  binary: boolean;
  truncated: boolean;
}

export interface GitLogOptions {
  skip?: number;
  limit?: number;
  ref?: string;
}

export interface GitCommitOptions {
  amend?: boolean;
  /** 本次纳入提交的相对路径（ugit 式重建 index） */
  paths: string[];
  /** 需 force-remove 的删除 / 重命名旧路径 */
  removePaths?: string[];
}

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FsListResult {
  entries: FsEntry[];
}

export interface FsFileSizeResult {
  /** 字节数；无法取得时为 null */
  size: number | null;
}
