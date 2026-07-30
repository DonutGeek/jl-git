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
  /** 工作区相对 index 的增删行 */
  worktreeAdditions?: number | null;
  worktreeDeletions?: number | null;
  /** 暂存区相对 HEAD 的增删行 */
  indexAdditions?: number | null;
  indexDeletions?: number | null;
  /** 工作区文件 mtime（Unix 毫秒）；已删除或不存在时缺省 */
  modifiedAt?: number | null;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  /** 仓库默认分支（通常对应 origin/HEAD） */
  isDefault: boolean;
  isRemote: boolean;
  upstream?: string;
  /** tip 提交短 hash；无则空串 */
  tipShortId: string;
  /** tip 提交作者时间（ISO-8601）；无则空串 */
  tipAuthoredAt: string;
  /** tip 提交作者名；无则空串 */
  tipAuthorName: string;
}

export interface GitCommitAuthor {
  name: string;
  email: string;
}

export interface GitCommitSummary {
  id: string;
  shortId: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  subject: string;
  /** 父提交完整 ID；历史图谱用以连接分叉与合并 */
  parentIds: string[];
  /** 指向该提交的分支 / 标签（已清洗） */
  refs: string[];
  /** Co-authored-by trailer */
  coAuthors: GitCommitAuthor[];
}

export interface GitChangedFile {
  path: string;
  status: string;
  /** 新增行数；二进制或未统计时为 undefined */
  additions?: number | null;
  /** 删除行数；二进制或未统计时为 undefined */
  deletions?: number | null;
}

export interface GitCommitParentDiff {
  parentId: string;
  parentShortId: string;
  files: GitChangedFile[];
  /** 是否因硬顶截断改动文件列表 */
  truncated?: boolean;
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

/** 单提交完整文案（标题与正文），用于提交信息历史回填。 */
export interface GitCommitMessageResult {
  message: string;
}

/** `git ls-tree -r --name-only`：某提交树下全部文件路径 */
export interface GitLsTreeResult {
  paths: string[];
  /** 是否因路径硬顶截断 */
  truncated: boolean;
}

/** 包含该提交的分支名（可含 HEAD） */
export interface GitContainingBranchesResult {
  branches: string[];
}

/** 改动文件数与 blob 总字节 */
export interface GitCommitChangeSizeResult {
  fileCount: number;
  totalBytes: number;
}

export interface GitLogResult {
  commits: GitCommitSummary[];
  hasMore: boolean;
}

export interface OkResult {
  ok: boolean;
}

export interface GitStashEntry {
  index: number;
  oid: string;
  message: string;
}

export interface GitStashListResult {
  entries: GitStashEntry[];
}

export interface RestoreLintStagedResult {
  restored: boolean;
  index?: number;
}

export type GitMergeMode = "default" | "noFf" | "squash" | "resolve" | "ort" | "noCommit";

export interface GitMergeOptions {
  mode?: GitMergeMode;
  autostash?: boolean;
}

export interface GitMergeResult {
  ok: boolean;
  conflict: boolean;
}

export interface GitFetchResult {
  ok: boolean;
  remote: string;
  /** 耗时（毫秒） */
  elapsedMs: number;
}

export interface GitPullResult {
  ok: boolean;
  /** 拉取产生未合并冲突时为 true */
  conflict: boolean;
  remote: string;
  elapsedMs: number;
}

export type ConflictSide = "ours" | "theirs";

export type GitRepoStateKind = "merge" | "rebase" | "cherryPick" | "none";

/** 冲突一侧标记行展示用提交摘要 */
export interface ConflictSideMeta {
  label: string;
  shortId?: string;
  authorName?: string;
  authoredAt?: string;
}

export interface GitRepoState {
  kind: GitRepoStateKind | string;
  merging: boolean;
  oursLabel: string;
  theirsLabel: string;
  conflictCount: number;
  conflictPaths: string[];
  mergeMessage?: string;
  oursMeta?: ConflictSideMeta;
  theirsMeta?: ConflictSideMeta;
}

export interface GitWorktreeFileResult {
  text: string;
  binary: boolean;
  truncated: boolean;
}

export interface GitPushResult {
  ok: boolean;
  remote: string;
  elapsedMs: number;
}

export interface GitCloneResult {
  /** 克隆完成后的本地仓库绝对路径 */
  path: string;
  elapsedMs: number;
}

export interface GitRemote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitRemotesResult {
  remotes: GitRemote[];
}

export interface GitBranchesResult {
  branches: GitBranch[];
}

export interface GitTag {
  name: string;
  target: string;
  /** 注解标签为 tagger 时间；轻量标签为指向提交时间；无则空串 */
  authoredAt: string;
  /** 注解标签的标签信息；轻量标签无 */
  message?: string;
  /** 指向提交的标题，供无标签信息时兜底展示 */
  subject?: string;
}

export interface GitTagsResult {
  tags: GitTag[];
}

/** 远端标签（来自 ls-remote），仅含名称与指向对象 id */
export interface GitRemoteTag {
  name: string;
  target: string;
}

export interface GitRemoteTagsResult {
  tags: GitRemoteTag[];
}

export interface GitCreateTagOptions {
  name: string;
  message?: string;
  ref?: string;
  push?: boolean;
  remote?: string;
}

export interface GitTagCreateResult {
  ok: boolean;
  pushed: boolean;
  pushError?: string;
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
  binaryComparison?: GitBinaryComparison;
}

/** 媒体预览来源：工作区 / 索引 / Git rev */
export type GitFileMediaSource = "worktree" | "index" | (string & {});

export interface GitFileMediaOptions {
  filePath: string;
  /** worktree | index | HEAD | commit… */
  source: GitFileMediaSource;
  maxBytes?: number;
}

export interface GitFileMedia {
  present: boolean;
  kind: "image" | "unsupported" | string;
  mime?: string;
  base64?: string;
  size: number;
  truncated: boolean;
}

/** 二进制文件的受限比较摘要；不会携带完整文件内容。 */
export interface GitBinaryComparison {
  oldSize?: number;
  newSize?: number;
  firstDifferenceOffset?: number;
  oldPreview?: string;
  newPreview?: string;
}

export type BranchCompareMode = "branch" | "localUpstream";

export interface GitBranchCompareOptions {
  base: string;
  target: string;
}

export interface GitBranchFileDiffOptions extends GitBranchCompareOptions {
  filePath: string;
  maxBytes?: number;
  encoding?: string;
}

export interface GitBranchCompareResult {
  files: GitChangedFile[];
}

/** 限长的暂存区 Diff 上下文，供 AI 提交文案建议使用。 */
export interface GitStagedDiffResult {
  patch: string;
  truncated: boolean;
}

/** 历史提交内单文件相对 parent 的前后对比 */
export interface GitCommitFileDiffOptions {
  filePath: string;
  commitRev: string;
  /** 缺省或空字符串表示根提交（无父，相对空树） */
  parentRev?: string;
  maxBytes?: number;
  /** 文本解码编码 id，见 TEXT_ENCODING_OPTIONS */
  encoding?: string;
}

/** 单行 blame（与 git blame --line-porcelain 对齐） */
export interface GitBlameLine {
  line: number;
  commitId: string;
  shortId: string;
  authorName: string;
  authoredAt: string;
}

export interface GitBlameResult {
  lines: GitBlameLine[];
}

/** 历史 log 排序：对应 git log 默认 / --topo-order / --date-order */
export type GitLogOrder = "default" | "topo" | "date";

export interface GitLogOptions {
  skip?: number;
  limit?: number;
  /** 指定 revision / 分支 / 标签；与 all 互斥 */
  ref?: string;
  /** true 时拉取所有引用可达历史（`git log --all`）；与 ref 互斥 */
  all?: boolean;
  /** 排序策略；省略或 default 为 git 默认序 */
  order?: GitLogOrder;
  /** 仅该仓库相对路径的历史（`git log -- <path>`） */
  path?: string;
  /**
   * 作者匹配模式（`git log --author`，多条为 OR）。
   * 调用方应对邮箱/姓名中的正则特殊字符转义。
   */
  authors?: string[];
  /** true 时 `git log --reverse`（从旧到新） */
  reverse?: boolean;
  /** 提交说明匹配（`git log --grep`） */
  grep?: string;
  /** `git log --since` */
  since?: string;
  /** `git log --until` */
  until?: string;
  /** true 时 `git log --no-merges` */
  noMerges?: boolean;
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

export interface FsRenameResult {
  /** 重命名后的仓库相对路径 */
  path: string;
}

export interface FsCreateResult {
  /** 新建后的仓库相对路径 */
  path: string;
  isDir: boolean;
}
