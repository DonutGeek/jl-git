import { create } from "zustand";

import i18n from "@/i18n";
import { gitService } from "@/services/git";
import { ensureGitIdentityBootstrapped } from "@/services/git/git.accounts";
import { buildHistoryLogOptions } from "@/services/git/git.log";
import type { AppError } from "@/types/error";
import { toUserMessage } from "@/types/error";
import type {
  GitBranch,
  GitCommitDetail,
  GitCommitSummary,
  GitIdentity,
  GitMergeOptions,
  GitMergeResult,
  GitPullResult,
  GitRemoteTag,
  GitRepoState,
  GitStatusEntry,
  GitStatusResult,
  GitTag,
  GitCreateTagOptions,
  GitLogOrder,
  GitTagCreateResult,
} from "@/types/git";
import {
  isConflictEntry,
  isConflictStatus,
  isStagedChangeEntry,
  isUnstagedChangeEntry,
  pruneDemotedConflictPaths,
} from "@/utils/gitConflict";
import { hasConfiguredGitIdentity } from "@/utils/gitIdentity";
import {
  EMPTY_HISTORY_ADVANCED_FILTERS,
  type HistoryAdvancedFilters,
} from "@/utils/historyAdvancedFilters";
import { beginRepoPendingOp, endRepoPendingOp, hasRepoPendingOp } from "@/utils/repoPendingOps";
import { hasUnresolvedConflicts, isWriteOpBlocked } from "@/utils/repoOperationGuard";

/** 仓库身份为空时，再走一遍启动播种/写回全局，然后重读 */
async function resolveRepoIdentity(repoPath: string): Promise<GitIdentity> {
  let identity = await gitService.getIdentity(repoPath);
  if (hasConfiguredGitIdentity(identity)) {
    return identity;
  }
  try {
    await ensureGitIdentityBootstrapped();
    identity = await gitService.getIdentity(repoPath);
  } catch (error) {
    console.warn("[useRepoStore] reconcile git identity failed", error);
  }
  return identity;
}

const LOG_PAGE_SIZE = 50;
/** 历史列表常驻提交硬顶：超出后停止加载更多，避免无限追加占内存 */
const LOG_COMMITS_HARD_CAP = 1500;
const COMMIT_DETAIL_CACHE_MAX = 24;
/** 多标签会话缓存上限（按最近使用） */
const REPO_SESSION_CACHE_MAX = 8;

/** 合并 / 重置历史提交，并在硬顶处截断 */
function applyLogCommits(
  current: readonly GitCommitSummary[],
  incoming: readonly GitCommitSummary[],
  reset: boolean,
): { commits: GitCommitSummary[]; capped: boolean } {
  const merged = reset ? [...incoming] : [...current, ...incoming];
  if (merged.length <= LOG_COMMITS_HARD_CAP) {
    return { commits: merged, capped: false };
  }
  return {
    commits: merged.slice(0, LOG_COMMITS_HARD_CAP),
    capped: true,
  };
}

/** Store 内提交数组按不可变方式更新，会话可直接复用未超限引用，避免切仓重复复制。 */
function capLogCommitsForSession(commits: GitCommitSummary[]): {
  commits: GitCommitSummary[];
  capped: boolean;
} {
  if (commits.length <= LOG_COMMITS_HARD_CAP) {
    return { commits, capped: false };
  }
  return { commits: commits.slice(0, LOG_COMMITS_HARD_CAP), capped: true };
}

/** 变更列表选中：worktree=变更区，index=待提交 */
export type ChangeSide = "worktree" | "index";

export interface SelectedChange {
  path: string;
  side: ChangeSide;
}

/** 历史详情中选中的改动文件：用于左侧整区切到文件前后对比 */
export interface SelectedCommitFile {
  commitId: string;
  /** 对比的父提交完整 ID；根提交（无父）为空字符串 */
  parentId: string;
  path: string;
  status: string;
}

/** 提交详情短缓存（按仓库路径隔离，避免切仓互相踩） */
const commitDetailCache = new Map<string, GitCommitDetail>();

/** 已打开仓库的会话快照：切标签时先还原，再后台刷新，避免每次冷加载卡顿 */
interface RepoSessionSnapshot {
  status: GitStatusResult | null;
  identity: GitIdentity | null;
  branches: GitBranch[];
  tags: GitTag[];
  remoteTags: GitRemoteTag[] | null;
  commits: GitCommitSummary[];
  hasMore: boolean;
  logRef: string | null;
  logOrder: GitLogOrder;
  /** 历史高级筛选（切标签保留；切仓清空） */
  historyAdvanced: HistoryAdvancedFilters;
  commitMessage: string;
  selectedCommitId: string | null;
  selectedChange: SelectedChange | null;
  repoState: GitRepoState | null;
  demotedConflictPaths: string[];
  error: string | null;
}

const repoSessionCache = new Map<string, RepoSessionSnapshot>();
const repoLoadGenerations = new Map<string, number>();
const repoActiveLoadGenerations = new Map<string, number>();
const repoColdLoadGenerations = new Map<string, number>();
const repoStatusRefreshGenerations = new Map<string, number>();
const hydratedRepoPaths = new Set<string>();

function beginRepoLoadGeneration(repoPath: string): number {
  const generation = (repoLoadGenerations.get(repoPath) ?? 0) + 1;
  repoLoadGenerations.set(repoPath, generation);
  repoActiveLoadGenerations.set(repoPath, generation);
  return generation;
}

function isLatestRepoLoad(repoPath: string, generation: number): boolean {
  return repoLoadGenerations.get(repoPath) === generation;
}

function beginStatusRefreshGeneration(repoPath: string): number {
  const generation = (repoStatusRefreshGenerations.get(repoPath) ?? 0) + 1;
  repoStatusRefreshGenerations.set(repoPath, generation);
  return generation;
}

function invalidateStatusRefresh(repoPath: string): void {
  repoStatusRefreshGenerations.set(repoPath, (repoStatusRefreshGenerations.get(repoPath) ?? 0) + 1);
}

function isLatestStatusRefresh(repoPath: string, generation: number): boolean {
  return repoStatusRefreshGenerations.get(repoPath) === generation;
}

function endActiveRepoLoad(repoPath: string, generation: number): void {
  if (repoActiveLoadGenerations.get(repoPath) === generation) {
    repoActiveLoadGenerations.delete(repoPath);
  }
}

function hasActiveRepoLoad(repoPath: string): boolean {
  return repoActiveLoadGenerations.has(repoPath);
}

function beginColdRepoLoad(repoPath: string, generation: number): void {
  repoColdLoadGenerations.set(repoPath, generation);
}

function endColdRepoLoad(repoPath: string, generation: number): void {
  if (repoColdLoadGenerations.get(repoPath) === generation) {
    repoColdLoadGenerations.delete(repoPath);
  }
}

function commitDetailCacheKey(repoPath: string, commitId: string): string {
  return `${repoPath}\0${commitId}`;
}

function cacheCommitDetail(repoPath: string, detail: GitCommitDetail): void {
  commitDetailCache.set(commitDetailCacheKey(repoPath, detail.id), detail);
  if (commitDetailCache.size <= COMMIT_DETAIL_CACHE_MAX) {
    return;
  }
  const oldest = commitDetailCache.keys().next().value;
  if (oldest) {
    commitDetailCache.delete(oldest);
  }
}

function getCachedCommitDetail(repoPath: string, commitId: string): GitCommitDetail | null {
  return commitDetailCache.get(commitDetailCacheKey(repoPath, commitId)) ?? null;
}

/** 仅清除指定仓库的详情缓存（冷启该仓时用，勿清空其它标签页） */
function clearCommitDetailCacheForRepo(repoPath: string): void {
  const prefix = `${repoPath}\0`;
  for (const key of [...commitDetailCache.keys()]) {
    if (key.startsWith(prefix)) {
      commitDetailCache.delete(key);
    }
  }
}

function clearCommitDetailCache(): void {
  commitDetailCache.clear();
}

/** 会话还原后若有选中提交但详情缺失，异步补拉，避免详情区直接显示失败 */
function ensureSelectedCommitDetail(): void {
  const state = useRepoStore.getState();
  const commitId = state.selectedCommitId;
  const repoPath = state.repoPath;
  if (!commitId || !repoPath) {
    return;
  }
  if (state.selectedCommitDetail?.id === commitId || state.detailLoading) {
    return;
  }
  void useRepoStore
    .getState()
    .selectCommit(commitId)
    .catch(() => undefined);
}

function saveRepoSession(repoPath: string, state: RepoStoreState): void {
  const { commits, capped } = capLogCommitsForSession(state.commits);

  putRepoSession(repoPath, {
    status: state.status,
    identity: state.identity,
    branches: state.branches,
    tags: state.tags,
    remoteTags: state.remoteTags,
    commits,
    hasMore: capped ? false : state.hasMore,
    logRef: state.logRef,
    logOrder: state.logOrder,
    historyAdvanced: state.historyAdvanced,
    commitMessage: state.commitMessage,
    selectedCommitId: state.selectedCommitId,
    selectedChange: state.selectedChange,
    repoState: state.repoState,
    demotedConflictPaths: state.demotedConflictPaths,
    error: state.error,
  });
}

function putRepoSession(repoPath: string, snapshot: RepoSessionSnapshot): void {
  if (repoSessionCache.has(repoPath)) {
    repoSessionCache.delete(repoPath);
  }
  repoSessionCache.set(repoPath, snapshot);
  while (repoSessionCache.size > REPO_SESSION_CACHE_MAX) {
    const oldest = repoSessionCache.keys().next().value;
    if (!oldest) {
      break;
    }
    repoSessionCache.delete(oldest);
  }
}

/** 后台操作完成时写回会话缓存（当前展示的不是该仓） */
function patchRepoSession(repoPath: string, patch: Partial<RepoSessionSnapshot>): void {
  const existing = repoSessionCache.get(repoPath);
  if (!existing) {
    return;
  }
  repoSessionCache.delete(repoPath);
  repoSessionCache.set(repoPath, { ...existing, ...patch });
}

/** 开始与仓库绑定的 loading 操作；仅当前仓刷新 UI loading */
function beginLoadingOp(
  repoPath: string,
  set: (state: Partial<RepoStoreState>) => void,
  get: () => { repoPath: string | null },
): void {
  beginRepoPendingOp(repoPath);
  patchRepoSession(repoPath, { error: null });
  if (get().repoPath === repoPath) {
    set({ loading: true, error: null });
  }
}

/** 结束 loading 操作；若同仓仍有其它 pending 则保持 loading */
function endLoadingOp(
  repoPath: string,
  set: (state: Partial<RepoStoreState>) => void,
  get: () => { repoPath: string | null },
): void {
  endRepoPendingOp(repoPath);
  if (get().repoPath === repoPath) {
    set({ loading: hasRepoPendingOp(repoPath) || hasActiveRepoLoad(repoPath) });
  }
}

/** 是否已有该仓库的会话缓存（切标签可秒开） */
export function hasRepoSession(repoPath: string): boolean {
  return repoSessionCache.has(repoPath);
}

interface RestoreRepoSessionOptions {
  deferHistory?: boolean;
}

/** 同步还原会话到 store；命中则返回 true（切标签首帧即可出数） */
export function restoreRepoSession(
  repoPath: string,
  { deferHistory = false }: RestoreRepoSessionOptions = {},
): boolean {
  const cached = repoSessionCache.get(repoPath);
  if (!cached) {
    return false;
  }
  hydratedRepoPaths.add(repoPath);

  const detail =
    !deferHistory && cached.selectedCommitId
      ? getCachedCommitDetail(repoPath, cached.selectedCommitId)
      : null;
  const needsDetail = Boolean(!deferHistory && cached.selectedCommitId && !detail);

  useRepoStore.setState({
    repoPath,
    status: cached.status,
    identity: cached.identity,
    branches: cached.branches,
    tags: cached.tags,
    remoteTags: cached.remoteTags,
    remoteTagsLoading: false,
    commits: deferHistory ? [] : cached.commits,
    hasMore: deferHistory ? false : cached.hasMore,
    logRef: deferHistory ? null : cached.logRef,
    logOrder: cached.logOrder ?? "default",
    historyAdvanced: cached.historyAdvanced ?? { ...EMPTY_HISTORY_ADVANCED_FILTERS },
    commitMessage: cached.commitMessage,
    selectedCommitId: deferHistory ? null : cached.selectedCommitId,
    selectedCommitDetail: detail,
    detailLoading: needsDetail,
    selectedChange: cached.selectedChange,
    selectedCommitFile: null,
    syncPendingKind: null,
    repoState: cached.repoState,
    demotedConflictPaths: cached.demotedConflictPaths,
    loading: hasRepoPendingOp(repoPath) || hasActiveRepoLoad(repoPath),
    error: cached.error,
  });
  if (needsDetail) {
    ensureSelectedCommitDetail();
  }
  return true;
}

/** 非历史首屏绘制后补回提交列表与历史选中项；目标已切走时不写当前 Store。 */
export function restoreRepoSessionHistory(repoPath: string): boolean {
  const cached = repoSessionCache.get(repoPath);
  if (!cached || useRepoStore.getState().repoPath !== repoPath) {
    return false;
  }
  const detail = cached.selectedCommitId
    ? getCachedCommitDetail(repoPath, cached.selectedCommitId)
    : null;
  const needsDetail = Boolean(cached.selectedCommitId && !detail);
  useRepoStore.setState({
    commits: cached.commits,
    hasMore: cached.hasMore,
    logRef: cached.logRef,
    logOrder: cached.logOrder ?? "default",
    historyAdvanced: cached.historyAdvanced ?? { ...EMPTY_HISTORY_ADVANCED_FILTERS },
    selectedCommitId: cached.selectedCommitId,
    selectedCommitDetail: detail,
    detailLoading: needsDetail,
    selectedCommitFile: null,
  });
  if (needsDetail) {
    ensureSelectedCommitDetail();
  }
  return true;
}

/** 轻量切仓：只改路径并清空列表，避免同步灌入大缓存造成点击卡顿 */
export function beginRepoSwitch(repoPath: string, resetCurrent = false): void {
  const current = useRepoStore.getState();
  const switchingPath = current.repoPath !== repoPath;
  if (!switchingPath && !resetCurrent) {
    return;
  }
  if (current.repoPath) {
    invalidateStatusRefresh(current.repoPath);
  }
  // 离开前写入会话，保留 A 仓的选中提交，返回时可还原
  if (
    switchingPath &&
    current.repoPath &&
    !repoColdLoadGenerations.has(current.repoPath) &&
    (!repoLoadGenerations.has(current.repoPath) || hydratedRepoPaths.has(current.repoPath))
  ) {
    saveRepoSession(current.repoPath, current);
  }
  useRepoStore.setState({
    repoPath,
    status: null,
    identity: null,
    branches: [],
    tags: [],
    remoteTags: null,
    remoteTagsLoading: false,
    commits: [],
    hasMore: false,
    logRef: null,
    // 排序偏好跨仓保留；高级筛选按仓清空
    historyAdvanced: { ...EMPTY_HISTORY_ADVANCED_FILTERS },
    commitMessage: "",
    selectedCommitId: null,
    selectedCommitDetail: null,
    detailLoading: false,
    selectedChange: null,
    selectedCommitFile: null,
    syncPendingKind: null,
    repoState: null,
    demotedConflictPaths: [],
    loading: true,
    error: null,
  });
}

function demotedSetFrom(paths: readonly string[]): ReadonlySet<string> {
  return new Set(paths);
}

/** 已暂存 / 冲突默认待提交（未 demote） */
function isStagedEntry(entry: GitStatusEntry, demotedConflictPaths: readonly string[]): boolean {
  return isStagedChangeEntry(entry, demotedSetFrom(demotedConflictPaths));
}

/** 未暂存 / 被放回变更的冲突 */
function isUnstagedEntry(entry: GitStatusEntry, demotedConflictPaths: readonly string[]): boolean {
  return isUnstagedChangeEntry(entry, demotedSetFrom(demotedConflictPaths));
}

/** status 刷新后校验选中项是否仍在对应列表；冲突侧随 demote 切换 */
function resolveSelectedChange(
  status: GitStatusResult | null,
  selected: SelectedChange | null,
  demotedConflictPaths: readonly string[],
): SelectedChange | null {
  if (!selected || !status) {
    return null;
  }
  const entry = status.entries.find((item) => item.path === selected.path);
  if (!entry) {
    return null;
  }
  if (isConflictEntry(entry)) {
    const demoted = demotedSetFrom(demotedConflictPaths).has(entry.path);
    return { path: entry.path, side: demoted ? "worktree" : "index" };
  }
  if (selected.side === "worktree" && isUnstagedEntry(entry, demotedConflictPaths)) {
    return selected;
  }
  if (selected.side === "index" && isStagedEntry(entry, demotedConflictPaths)) {
    return selected;
  }
  return null;
}

/** status 更新时同步裁剪 demote 列表并校正选中项 */
function statusSelectionPatch(
  get: () => RepoStore,
  status: GitStatusResult,
): Pick<RepoStoreState, "demotedConflictPaths" | "selectedChange"> {
  const demotedConflictPaths = pruneDemotedConflictPaths(
    get().demotedConflictPaths,
    status.entries,
  );
  return {
    demotedConflictPaths,
    selectedChange: resolveSelectedChange(status, get().selectedChange, demotedConflictPaths),
  };
}

/** 将状态刷新结果只写回发起仓库；后台完成时更新会话缓存。 */
function applyStatusResult(
  repoPath: string,
  status: GitStatusResult,
  set: (state: Partial<RepoStoreState>) => void,
  get: () => RepoStore,
): void {
  if (get().repoPath !== repoPath) {
    patchRepoSession(repoPath, { status });
    return;
  }
  set({ status, ...statusSelectionPatch(get, status) });
  saveRepoSession(repoPath, get());
}

interface RepoStoreState {
  repoPath: string | null;
  status: GitStatusResult | null;
  identity: GitIdentity | null;
  branches: GitBranch[];
  tags: GitTag[];
  /** 远端标签（ls-remote 结果）；null 表示未知/无远端/离线，用于避免误判未推送 */
  remoteTags: GitRemoteTag[] | null;
  /** 远端标签是否正在查询 */
  remoteTagsLoading: boolean;
  commits: GitCommitSummary[];
  hasMore: boolean;
  /** 历史列表范围；空值表示当前默认历史。 */
  logRef: string | null;
  /** 历史 log 排序（git 默认 / topo / date） */
  logOrder: GitLogOrder;
  /** 历史高级筛选（已应用；切仓清空） */
  historyAdvanced: HistoryAdvancedFilters;
  commitMessage: string;
  /** 历史列表当前选中的提交 id */
  selectedCommitId: string | null;
  selectedCommitDetail: GitCommitDetail | null;
  detailLoading: boolean;
  /** 变更 / 待提交列表当前选中文件 */
  selectedChange: SelectedChange | null;
  /** 历史详情中选中的改动文件（左侧整区切换为文件前后对比） */
  selectedCommitFile: SelectedCommitFile | null;
  /** 工具栏待推送/待更新全工作区差异对比 */
  syncPendingKind: "push" | "pull" | null;
  /** 合并/变基进行中状态与冲突列表 */
  repoState: GitRepoState | null;
  /** 递增后 RepoPage 切到变更视图并聚焦冲突 */
  conflictFocusEpoch: number;
  /** @deprecated 冲突文件不再允许 demote；保留字段仅兼容旧会话状态 */
  demotedConflictPaths: string[];
  loading: boolean;
  error: string | null;
}

interface RepoStoreActions {
  reset: () => void;
  setRepoPath: (path: string) => void;
  setCommitMessage: (msg: string) => void;
  selectChange: (selection: SelectedChange | null) => void;
  selectCommitFile: (file: SelectedCommitFile | null) => void;
  setSyncPendingKind: (kind: "push" | "pull" | null) => void;
  openSyncPendingPreview: (kind: "push" | "pull") => void;
  closeSyncPendingPreview: () => void;
  refreshRepoState: () => Promise<GitRepoState | null>;
  /** 重新拉取当前仓库生效的 Git 身份（设置改账号后调用） */
  refreshIdentity: () => Promise<void>;
  /** 选中首个冲突文件并请求聚焦变更视图 */
  focusFirstConflict: () => void;
  loadAll: (repoPath: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshTags: () => Promise<void>;
  refreshLog: (reset?: boolean) => Promise<void>;
  selectLogRef: (ref: string | null) => Promise<void>;
  /** 切换历史排序并重新拉取 log */
  setLogOrder: (order: GitLogOrder) => Promise<void>;
  /** 应用历史高级筛选并重拉 log */
  applyHistoryAdvanced: (filters: HistoryAdvancedFilters) => Promise<void>;
  /** 清空高级筛选（保留合并偏好由调用方写入 filters）并重拉 */
  clearHistoryAdvanced: (showMergeCommits?: boolean) => Promise<void>;
  createTag: (options: GitCreateTagOptions) => Promise<GitTagCreateResult>;
  deleteTag: (name: string) => Promise<void>;
  /** 查询远端标签（联网），刷新本地/远端分组数据 */
  refreshRemoteTags: () => Promise<void>;
  /** 推送单个标签到默认远端（origin 优先） */
  pushTag: (name: string) => Promise<void>;
  /** 拉取远端标签到本地 */
  fetchRemoteTag: (name: string) => Promise<void>;
  /** 从默认远端删除标签 */
  deleteRemoteTag: (name: string) => Promise<void>;
  /** 同时删除本地与远端标签 */
  deleteTagBoth: (name: string) => Promise<void>;
  loadMoreLog: () => Promise<void>;
  selectCommit: (commitId: string | null) => Promise<void>;
  stage: (paths: string[]) => Promise<void>;
  unstage: (paths: string[]) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  /** 放弃更改（调用前 UI 须确认） */
  discard: (paths: string[]) => Promise<void>;
  commit: () => Promise<string>;
  /** 仅修改 HEAD 提交信息（rev 须为当前 HEAD） */
  amendMessage: (rev: string, message: string) => Promise<string>;
  /** 撤销最近未推送提交：reset --mixed，变更回到工作区 */
  undoCommit: () => Promise<{ target: string; elapsedMs: number }>;
  merge: (source: string, options?: GitMergeOptions) => Promise<GitMergeResult>;
  checkout: (ref: string) => Promise<void>;
  createBranch: (
    name: string,
    options?: { startPoint?: string; checkout?: boolean },
  ) => Promise<void>;
  deleteBranch: (
    name: string,
    options?: { force?: boolean; deleteRemote?: boolean; remote?: string },
  ) => Promise<void>;
  renameBranch: (oldName: string, newName: string) => Promise<void>;
  /** 检查更新：fetch 远端后刷新 status / branches */
  fetch: (remote?: string) => Promise<{ remote: string; elapsedMs: number }>;
  /** 更新：pull 后刷新 status / branches / log */
  pull: (options?: {
    remote?: string;
    branch?: string;
    rebase?: boolean;
  }) => Promise<Pick<GitPullResult, "ok" | "conflict" | "remote" | "elapsedMs">>;
  /** 推送到远端后刷新 status / log */
  push: (options?: {
    remote?: string;
    branch?: string;
    setUpstream?: boolean;
    force?: boolean;
    /** 发起推送时的仓库路径；切标签后仍推原仓（提交后推送必传） */
    repoPath?: string;
  }) => Promise<{ remote: string; elapsedMs: number }>;
  /**
   * 包裹复合写操作（如提交后推送），在子操作间隙保持 loading，
   * 避免顶栏推送等按钮短暂可点导致双重推送。
   */
  holdLoading: <T>(fn: () => Promise<T>) => Promise<T>;
}

type RepoStore = RepoStoreState & RepoStoreActions;

const initialState: RepoStoreState = {
  repoPath: null,
  status: null,
  identity: null,
  branches: [],
  tags: [],
  remoteTags: null,
  remoteTagsLoading: false,
  commits: [],
  hasMore: false,
  logRef: null,
  logOrder: "default",
  historyAdvanced: { ...EMPTY_HISTORY_ADVANCED_FILTERS },
  commitMessage: "",
  selectedCommitId: null,
  selectedCommitDetail: null,
  detailLoading: false,
  selectedChange: null,
  selectedCommitFile: null,
  syncPendingKind: null,
  repoState: null,
  conflictFocusEpoch: 0,
  demotedConflictPaths: [],
  loading: false,
  error: null,
};

function firstConflictPath(status: GitStatusResult | null): string | null {
  const entry = status?.entries.find((item) =>
    isConflictStatus(item.indexStatus, item.worktreeStatus),
  );
  return entry?.path ?? null;
}

async function syncAfterConflictOp(
  repoPath: string,
  set: (partial: Partial<RepoStoreState>) => void,
  get: () => RepoStore,
  origin: Pick<
    RepoStoreState,
    "commitMessage" | "conflictFocusEpoch" | "demotedConflictPaths" | "selectedChange"
  >,
  options?: { focusConflict?: boolean; preferMergeMessage?: boolean },
): Promise<GitRepoState | null> {
  const [status, repoState] = await Promise.all([
    gitService.getStatus(repoPath),
    gitService.getRepoState(repoPath),
  ]);
  const focusPath =
    options?.focusConflict && repoState.conflictCount > 0
      ? (repoState.conflictPaths[0] ?? firstConflictPath(status))
      : null;

  const current = get().repoPath === repoPath ? get() : origin;
  const nextMessage =
    options?.preferMergeMessage && repoState.mergeMessage && !current.commitMessage.trim()
      ? repoState.mergeMessage
      : current.commitMessage;

  const demotedConflictPaths = pruneDemotedConflictPaths(
    current.demotedConflictPaths,
    status.entries,
  );
  const selectedChange = focusPath
    ? {
        path: focusPath,
        side: demotedConflictPaths.includes(focusPath) ? ("worktree" as const) : ("index" as const),
      }
    : resolveSelectedChange(status, current.selectedChange, demotedConflictPaths);

  if (get().repoPath !== repoPath) {
    patchRepoSession(repoPath, {
      status,
      repoState,
      demotedConflictPaths,
      commitMessage: nextMessage,
      selectedChange,
    });
    return repoState;
  }

  set({
    status,
    repoState,
    demotedConflictPaths,
    commitMessage: nextMessage,
    selectedChange,
    conflictFocusEpoch: focusPath ? get().conflictFocusEpoch + 1 : get().conflictFocusEpoch,
  });
  saveRepoSession(repoPath, get());
  return repoState;
}

function requireRepoPath(repoPath: string | null): string {
  if (!repoPath) {
    throwValidationError(i18n.t("repo.errors.noRepo"));
  }

  return repoPath;
}

/** 解析默认远端名（origin 优先，否则第一个）；无远端返回 null */
async function resolveDefaultRemoteOrNull(repoPath: string): Promise<string | null> {
  const remotes = await gitService.listRemotes(repoPath);
  const preferred = remotes.find((remote) => remote.name === "origin") ?? remotes[0];
  return preferred?.name ?? null;
}

/** 解析默认远端名（origin 优先，否则第一个）；无远端时抛校验错误 */
async function resolveDefaultRemote(repoPath: string): Promise<string> {
  const remote = await resolveDefaultRemoteOrNull(repoPath);
  if (!remote) {
    throwValidationError(i18n.t("repo.tagPushUnavailable"));
  }
  return remote;
}

/** 冲突或合并进行中时拒绝切换分支等写操作 */
function assertWriteOpAllowed(get: () => RepoStore): void {
  const repoState = get().repoState;
  if (!isWriteOpBlocked(repoState)) {
    return;
  }
  if (hasUnresolvedConflicts(repoState)) {
    throwValidationError(i18n.t("repo.conflictOpBlockedMessage"));
  }
  throwValidationError(i18n.t("repo.conflictOpBlockedInProgress"));
}

function throwValidationError(message: string): never {
  throw {
    code: "VALIDATION",
    message,
  } satisfies AppError;
}

function setError(
  set: (state: Partial<RepoStoreState>) => void,
  get: () => { repoPath: string | null },
  repoPath: string,
  error: unknown,
): void {
  const message = toUserMessage(error);
  patchRepoSession(repoPath, { error: message });
  if (get().repoPath === repoPath) {
    set({
      error: message,
      // 同仓若仍有其它 pending（如提交中又刷新失败），勿误关 loading
      loading: hasRepoPendingOp(repoPath),
    });
  }
}

/**
 * 乐观标记：把标签标记为「已存在于远端」，避免推送/带推送创建后短暂显示「未推送」。
 * 远端未知（remoteTags 为 null）时不臆造列表，交由后续刷新（打开面板/手动刷新）决定。
 */
function markRemoteTagPresent(
  repoPath: string,
  set: (state: Partial<RepoStoreState>) => void,
  get: () => RepoStore,
  name: string,
): void {
  const current = get().repoPath === repoPath ? get() : repoSessionCache.get(repoPath);
  const remoteTags = current?.remoteTags ?? null;
  if (!remoteTags || remoteTags.some((tag) => tag.name === name)) {
    return;
  }
  const target = current?.tags.find((tag) => tag.name === name)?.target ?? "";
  const nextRemoteTags = [...remoteTags, { name, target }];
  if (get().repoPath === repoPath) {
    set({ remoteTags: nextRemoteTags });
    saveRepoSession(repoPath, get());
  } else {
    patchRepoSession(repoPath, { remoteTags: nextRemoteTags });
  }
}

/** 乐观移除：远端标签删除成功后同步移除远端缓存中的对应项 */
function removeRemoteTagPresent(
  repoPath: string,
  set: (state: Partial<RepoStoreState>) => void,
  get: () => RepoStore,
  name: string,
): void {
  const current = get().repoPath === repoPath ? get() : repoSessionCache.get(repoPath);
  const remoteTags = current?.remoteTags ?? null;
  if (!remoteTags) {
    return;
  }
  const nextRemoteTags = remoteTags.filter((tag) => tag.name !== name);
  if (get().repoPath === repoPath) {
    set({ remoteTags: nextRemoteTags });
    saveRepoSession(repoPath, get());
  } else {
    patchRepoSession(repoPath, { remoteTags: nextRemoteTags });
  }
}

export const useRepoStore = create<RepoStore>((set, get) => ({
  ...initialState,

  reset() {
    clearCommitDetailCache();
    set(initialState);
  },

  setRepoPath(path) {
    set({ repoPath: path, error: null });
  },

  setCommitMessage(msg) {
    set({ commitMessage: msg });
  },

  selectChange(selection) {
    if (!selection) {
      set({ selectedChange: null });
      return;
    }
    const entry = get().status?.entries.find((item) => item.path === selection.path);
    // 点选冲突文件时递增聚焦信号，预览锁定到第一处冲突
    const focusConflict = entry ? isConflictEntry(entry) : false;
    set({
      selectedChange: selection,
      conflictFocusEpoch: focusConflict ? get().conflictFocusEpoch + 1 : get().conflictFocusEpoch,
    });
  },

  async refreshRepoState() {
    const repoPath = get().repoPath;
    if (!repoPath) {
      set({ repoState: null });
      return null;
    }
    try {
      const repoState = await gitService.getRepoState(repoPath);
      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, { repoState });
        return repoState;
      }
      set({ repoState });
      saveRepoSession(repoPath, get());
      return repoState;
    } catch (error) {
      console.warn("[useRepoStore] refreshRepoState failed", error);
      return get().repoPath === repoPath
        ? get().repoState
        : (repoSessionCache.get(repoPath)?.repoState ?? null);
    }
  },

  async refreshIdentity() {
    const repoPath = get().repoPath;
    if (!repoPath) {
      set({ identity: null });
      return;
    }
    try {
      const identity = await resolveRepoIdentity(repoPath);
      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, { identity });
        return;
      }
      set({ identity });
      saveRepoSession(repoPath, get());
    } catch (error) {
      console.warn("[useRepoStore] refreshIdentity failed", error);
    }
  },

  focusFirstConflict() {
    const status = get().status;
    const fromState = get().repoState?.conflictPaths[0] ?? null;
    const path = fromState ?? firstConflictPath(status);
    if (!path) {
      return;
    }
    const demoted = get().demotedConflictPaths.includes(path);
    set({
      selectedChange: { path, side: demoted ? "worktree" : "index" },
      conflictFocusEpoch: get().conflictFocusEpoch + 1,
    });
  },

  selectCommitFile(file) {
    set({
      selectedCommitFile: file,
      ...(file ? { syncPendingKind: null } : {}),
    });
  },

  setSyncPendingKind(kind) {
    set({ syncPendingKind: kind });
  },

  openSyncPendingPreview(kind) {
    set({ syncPendingKind: kind, selectedCommitFile: null });
  },

  closeSyncPendingPreview() {
    set({ syncPendingKind: null });
  },

  async loadAll(repoPath) {
    const generation = beginRepoLoadGeneration(repoPath);
    const cached = repoSessionCache.get(repoPath);
    const coldLoad = !cached;
    if (coldLoad) {
      hydratedRepoPaths.delete(repoPath);
      beginColdRepoLoad(repoPath, generation);
    }
    patchRepoSession(repoPath, { error: null });
    if (get().repoPath === repoPath) {
      set({ loading: true, error: null });
    }

    // 命中会话缓存：立刻还原 UI，再后台静默刷新（切标签不再整页等待）
    if (cached) {
      const detail = cached.selectedCommitId
        ? getCachedCommitDetail(repoPath, cached.selectedCommitId)
        : null;
      const needsDetail = Boolean(cached.selectedCommitId && !detail);
      if (isLatestRepoLoad(repoPath, generation) && get().repoPath === repoPath) {
        set({
          repoPath,
          status: cached.status,
          identity: cached.identity,
          branches: cached.branches,
          tags: cached.tags,
          commits: cached.commits,
          hasMore: cached.hasMore,
          logRef: cached.logRef,
          logOrder: cached.logOrder ?? "default",
          historyAdvanced: cached.historyAdvanced ?? { ...EMPTY_HISTORY_ADVANCED_FILTERS },
          commitMessage: cached.commitMessage,
          selectedCommitId: cached.selectedCommitId,
          selectedCommitDetail: detail,
          detailLoading: needsDetail,
          selectedChange: cached.selectedChange,
          selectedCommitFile: null,
          loading: true,
          error: null,
        });
        if (needsDetail) {
          ensureSelectedCommitDetail();
        }
      }

      try {
        const [status, identity, branches, tags, log, repoState] = await Promise.all([
          gitService.getStatus(repoPath),
          resolveRepoIdentity(repoPath),
          gitService.listBranches(repoPath, true),
          gitService.listTags(repoPath),
          gitService.getLog(
            repoPath,
            buildHistoryLogOptions({
              limit: LOG_PAGE_SIZE,
              logRef: cached.logRef,
              order: cached.logOrder ?? "default",
              advanced: cached.historyAdvanced,
            }),
          ),
          gitService.getRepoState(repoPath),
        ]);

        // 用户已切到其他仓库则写回缓存，勿污染当前仓
        if (!isLatestRepoLoad(repoPath, generation)) {
          return;
        }
        if (get().repoPath !== repoPath) {
          patchRepoSession(repoPath, {
            status,
            identity,
            branches,
            tags: tags.tags,
            commits: log.commits,
            hasMore: log.hasMore,
            repoState,
          });
          return;
        }

        set({
          status,
          identity,
          branches,
          tags: tags.tags,
          commits: log.commits,
          hasMore: log.hasMore,
          ...statusSelectionPatch(get, status),
          repoState,
        });
        hydratedRepoPaths.add(repoPath);
        saveRepoSession(repoPath, get());
        // 刷新后选中提交可能已不在列表；仍在则补详情
        ensureSelectedCommitDetail();
      } catch (error) {
        if (isLatestRepoLoad(repoPath, generation)) {
          setError(set, get, repoPath, error);
        }
        throw error;
      } finally {
        endActiveRepoLoad(repoPath, generation);
        if (isLatestRepoLoad(repoPath, generation) && get().repoPath === repoPath) {
          set({ loading: hasRepoPendingOp(repoPath) || hasActiveRepoLoad(repoPath) });
        }
        if (coldLoad) {
          endColdRepoLoad(repoPath, generation);
        }
      }
      return;
    }

    // 冷启动：清空旧数据；历史默认「所有分支」（logRef = null → --all）
    if (isLatestRepoLoad(repoPath, generation) && get().repoPath === repoPath) {
      set({
        repoPath,
        status: null,
        identity: null,
        branches: [],
        tags: [],
        commits: [],
        hasMore: false,
        logRef: null,
        historyAdvanced: { ...EMPTY_HISTORY_ADVANCED_FILTERS },
        commitMessage: "",
        selectedCommitId: null,
        selectedCommitDetail: null,
        detailLoading: false,
        selectedChange: null,
        selectedCommitFile: null,
        repoState: null,
        loading: true,
        error: null,
      });
    }
    clearCommitDetailCacheForRepo(repoPath);

    try {
      const logOrder = get().logOrder;
      const historyAdvanced = get().historyAdvanced;
      const applyIfCurrent = (patch: Partial<RepoStoreState>): void => {
        if (isLatestRepoLoad(repoPath, generation) && get().repoPath === repoPath) {
          set(patch);
        }
      };

      const statusPromise = (async () => {
        let status = await gitService.getStatus(repoPath);

        // 后端仅在存在 JLGit 恢复标记时处理，不能按 stash 消息误恢复用户旧备份。
        try {
          const restore = await gitService.restoreLintStagedBackup(repoPath);
          if (restore.restored) {
            status = await gitService.getStatus(repoPath);
          }
        } catch (restoreError) {
          // 打开仓库时救场失败不阻断主流程，但保留诊断信息。
          console.warn("[repo] restore interrupted commit failed", restoreError);
        }

        applyIfCurrent({
          status,
          ...statusSelectionPatch(get, status),
        });
        return status;
      })();

      const identityPromise = resolveRepoIdentity(repoPath).then((identity) => {
        applyIfCurrent({ identity });
        return identity;
      });
      const branchesPromise = gitService.listBranches(repoPath, true).then((branches) => {
        applyIfCurrent({ branches });
        return branches;
      });
      const tagsPromise = gitService.listTags(repoPath).then((tags) => {
        applyIfCurrent({ tags: tags.tags });
        return tags;
      });
      const repoStatePromise = gitService.getRepoState(repoPath).then((repoState) => {
        applyIfCurrent({ repoState });
        return repoState;
      });
      const logPromise = gitService
        .getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef: null,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        )
        .then((log) => {
          applyIfCurrent({
            commits: log.commits,
            hasMore: log.hasMore,
            logRef: null,
          });
          return log;
        });

      const [status, identity, branches, tags, log, repoState] = await Promise.all([
        statusPromise,
        identityPromise,
        branchesPromise,
        tagsPromise,
        logPromise,
        repoStatePromise,
      ]);

      if (!isLatestRepoLoad(repoPath, generation)) {
        return;
      }
      if (get().repoPath !== repoPath) {
        const { commits, capped } = applyLogCommits([], log.commits, true);
        putRepoSession(repoPath, {
          status,
          identity,
          branches,
          tags: tags.tags,
          remoteTags: null,
          commits,
          hasMore: capped ? false : log.hasMore,
          logRef: null,
          logOrder,
          historyAdvanced,
          commitMessage: "",
          selectedCommitId: null,
          selectedChange: null,
          repoState,
          demotedConflictPaths: [],
          error: null,
        });
        hydratedRepoPaths.add(repoPath);
        return;
      }

      set({
        status,
        identity,
        branches,
        tags: tags.tags,
        commits: log.commits,
        hasMore: log.hasMore,
        logRef: null,
        repoState,
      });
      hydratedRepoPaths.add(repoPath);
      saveRepoSession(repoPath, get());
    } catch (error) {
      if (isLatestRepoLoad(repoPath, generation)) {
        setError(set, get, repoPath, error);
      }
      throw error;
    } finally {
      endActiveRepoLoad(repoPath, generation);
      if (isLatestRepoLoad(repoPath, generation) && get().repoPath === repoPath) {
        set({ loading: hasRepoPendingOp(repoPath) || hasActiveRepoLoad(repoPath) });
      }
      if (coldLoad) {
        endColdRepoLoad(repoPath, generation);
      }
    }
  },

  async refreshStatus() {
    const repoPath = requireRepoPath(get().repoPath);
    const generation = beginStatusRefreshGeneration(repoPath);
    beginLoadingOp(repoPath, set, get);

    try {
      const [initialStatus, repoState] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.getRepoState(repoPath),
      ]);
      let status = initialStatus;
      try {
        const restore = await gitService.restoreLintStagedBackup(repoPath);
        if (restore.restored) {
          status = await gitService.getStatus(repoPath);
        }
      } catch (restoreError) {
        // 刷新时救场失败不阻断，但保留诊断信息。
        console.warn("[repo] restore interrupted commit on refresh failed", restoreError);
      }
      if (!isLatestStatusRefresh(repoPath, generation)) {
        return;
      }
      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, { status, repoState });
        return;
      }
      set({
        status,
        repoState,
        ...statusSelectionPatch(get, status),
      });
      saveRepoSession(repoPath, get());
    } catch (error) {
      if (isLatestStatusRefresh(repoPath, generation)) {
        setError(set, get, repoPath, error);
      }
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async refreshBranches() {
    const repoPath = requireRepoPath(get().repoPath);
    beginLoadingOp(repoPath, set, get);

    try {
      const branches = await gitService.listBranches(repoPath, true);
      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, { branches });
        return;
      }
      set({ branches });
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async refreshTags() {
    const repoPath = requireRepoPath(get().repoPath);
    beginLoadingOp(repoPath, set, get);
    try {
      const result = await gitService.listTags(repoPath);
      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, { tags: result.tags });
        return;
      }
      set({ tags: result.tags });
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async refreshLog(reset = true) {
    const repoPath = requireRepoPath(get().repoPath);
    const currentCommits = get().commits;
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;
    beginLoadingOp(repoPath, set, get);

    try {
      const skip = reset ? 0 : currentCommits.length;
      const log = await gitService.getLog(
        repoPath,
        buildHistoryLogOptions({
          skip,
          limit: LOG_PAGE_SIZE,
          logRef,
          order: logOrder,
          advanced: historyAdvanced,
        }),
      );

      const { commits, capped } = applyLogCommits(currentCommits, log.commits, reset);
      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, {
          commits,
          hasMore: capped ? false : log.hasMore,
        });
        return;
      }

      set({
        commits,
        hasMore: capped ? false : log.hasMore,
      });
      saveRepoSession(repoPath, get());
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async selectLogRef(ref) {
    if (get().logRef === ref) {
      return;
    }
    const repoPath = get().repoPath;
    if (repoPath) {
      clearCommitDetailCacheForRepo(repoPath);
    }
    set({
      logRef: ref,
      selectedCommitId: null,
      selectedCommitDetail: null,
      selectedCommitFile: null,
    });
    await get().refreshLog(true);
  },

  async setLogOrder(order) {
    if (get().logOrder === order) {
      return;
    }
    set({ logOrder: order });
    await get().refreshLog(true);
  },

  async applyHistoryAdvanced(filters) {
    set({
      historyAdvanced: { ...filters },
      selectedCommitId: null,
      selectedCommitDetail: null,
      selectedCommitFile: null,
    });
    const repoPath = get().repoPath;
    if (repoPath) {
      clearCommitDetailCacheForRepo(repoPath);
    }
    await get().refreshLog(true);
  },

  async clearHistoryAdvanced(showMergeCommits = true) {
    set({
      historyAdvanced: {
        ...EMPTY_HISTORY_ADVANCED_FILTERS,
        showMergeCommits,
      },
      selectedCommitId: null,
      selectedCommitDetail: null,
      selectedCommitFile: null,
    });
    const repoPath = get().repoPath;
    if (repoPath) {
      clearCommitDetailCacheForRepo(repoPath);
    }
    await get().refreshLog(true);
  },

  async createTag(options) {
    const repoPath = requireRepoPath(get().repoPath);
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;
    beginLoadingOp(repoPath, set, get);
    try {
      const result = await gitService.createTag(repoPath, options);
      const [tags, log] = await Promise.all([
        gitService.listTags(repoPath),
        gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        ),
      ]);
      if (get().repoPath === repoPath) {
        set({ tags: tags.tags, commits: log.commits, hasMore: log.hasMore });
        saveRepoSession(repoPath, get());
      } else {
        patchRepoSession(repoPath, {
          tags: tags.tags,
          commits: log.commits,
          hasMore: log.hasMore,
        });
      }
      // 推送成功后立即同步远端状态，避免新标签短暂显示「未推送」
      if (result.pushed) {
        markRemoteTagPresent(repoPath, set, get, options.name);
      }
      return result;
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async deleteTag(name) {
    const repoPath = requireRepoPath(get().repoPath);
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;
    const deletedSelectedRef = logRef === name;
    beginLoadingOp(repoPath, set, get);
    try {
      await gitService.deleteTag(repoPath, name);
      const tags = await gitService.listTags(repoPath);
      let logPatch: Partial<RepoSessionSnapshot> = {};
      if (deletedSelectedRef) {
        const log = await gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef: null,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        );
        logPatch = {
          logRef: null,
          commits: log.commits,
          hasMore: log.hasMore,
          selectedCommitId: null,
        };
      }
      if (get().repoPath === repoPath) {
        set({
          tags: tags.tags,
          ...logPatch,
          ...(deletedSelectedRef ? { selectedCommitDetail: null, selectedCommitFile: null } : {}),
        });
        saveRepoSession(repoPath, get());
      } else {
        patchRepoSession(repoPath, { tags: tags.tags, ...logPatch });
      }
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async pushTag(name) {
    const repoPath = requireRepoPath(get().repoPath);
    beginLoadingOp(repoPath, set, get);
    try {
      const remote = await resolveDefaultRemote(repoPath);
      await gitService.pushTag(repoPath, name, remote);
      markRemoteTagPresent(repoPath, set, get, name);
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async deleteRemoteTag(name) {
    const repoPath = requireRepoPath(get().repoPath);
    beginLoadingOp(repoPath, set, get);
    try {
      const remote = await resolveDefaultRemote(repoPath);
      await gitService.deleteRemoteTag(repoPath, name, remote);
      removeRemoteTagPresent(repoPath, set, get, name);
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async deleteTagBoth(name) {
    const repoPath = requireRepoPath(get().repoPath);
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;
    const deletedSelectedRef = logRef === name;
    beginLoadingOp(repoPath, set, get);
    try {
      const remote = await resolveDefaultRemote(repoPath);
      // 先删远端再删本地：远端失败时本地标签仍保留，便于重试
      await gitService.deleteRemoteTag(repoPath, name, remote);
      removeRemoteTagPresent(repoPath, set, get, name);
      await gitService.deleteTag(repoPath, name);
      const tags = await gitService.listTags(repoPath);
      let logPatch: Partial<RepoSessionSnapshot> = {};
      if (deletedSelectedRef) {
        const log = await gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef: null,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        );
        logPatch = {
          logRef: null,
          commits: log.commits,
          hasMore: log.hasMore,
          selectedCommitId: null,
        };
      }
      if (get().repoPath === repoPath) {
        set({
          tags: tags.tags,
          ...logPatch,
          ...(deletedSelectedRef ? { selectedCommitDetail: null, selectedCommitFile: null } : {}),
        });
        saveRepoSession(repoPath, get());
      } else {
        patchRepoSession(repoPath, { tags: tags.tags, ...logPatch });
      }
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async refreshRemoteTags() {
    const repoPath = get().repoPath;
    if (!repoPath) {
      return;
    }
    if (get().repoPath === repoPath) {
      set({ remoteTagsLoading: true });
    }
    try {
      const remote = await resolveDefaultRemoteOrNull(repoPath);
      if (!remote) {
        // 无远端：置 null 表示「未知」，避免把本地标签误判为未推送
        if (get().repoPath === repoPath) {
          set({ remoteTags: null, remoteTagsLoading: false });
          saveRepoSession(repoPath, get());
        } else {
          patchRepoSession(repoPath, { remoteTags: null });
        }
        return;
      }
      const remoteTags = await gitService.listRemoteTags(repoPath, remote);
      if (get().repoPath === repoPath) {
        set({ remoteTags, remoteTagsLoading: false });
        saveRepoSession(repoPath, get());
      } else {
        patchRepoSession(repoPath, { remoteTags });
      }
    } catch (error) {
      // 离线/无权限等失败不应影响本地标签展示，静默降级为「未知」
      console.warn("加载远端标签失败", error);
      if (get().repoPath === repoPath) {
        set({ remoteTags: null, remoteTagsLoading: false });
      } else {
        patchRepoSession(repoPath, { remoteTags: null });
      }
    }
  },

  async fetchRemoteTag(name) {
    const repoPath = requireRepoPath(get().repoPath);
    beginLoadingOp(repoPath, set, get);
    try {
      const remote = await resolveDefaultRemote(repoPath);
      await gitService.fetchRemoteTag(repoPath, name, remote);
      const tags = await gitService.listTags(repoPath);
      if (get().repoPath === repoPath) {
        set({ tags: tags.tags });
        saveRepoSession(repoPath, get());
      } else {
        patchRepoSession(repoPath, { tags: tags.tags });
      }
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async loadMoreLog() {
    if (!get().hasMore) {
      return;
    }

    // 不拉全局 loading：避免工具栏/列表整页进入加载态，底部用局部 loadingMore 提示
    set({ error: null });
    const repoPath = requireRepoPath(get().repoPath);
    const currentCommits = get().commits;
    const skip = currentCommits.length;
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;

    try {
      const log = await gitService.getLog(
        repoPath,
        buildHistoryLogOptions({
          skip,
          limit: LOG_PAGE_SIZE,
          logRef,
          order: logOrder,
          advanced: historyAdvanced,
        }),
      );

      const { commits, capped } = applyLogCommits(currentCommits, log.commits, false);
      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, {
          commits,
          hasMore: capped ? false : log.hasMore,
        });
        return;
      }

      set({
        commits,
        hasMore: capped ? false : log.hasMore,
      });
      saveRepoSession(repoPath, get());
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    }
  },

  async selectCommit(commitId) {
    if (!commitId) {
      set({
        selectedCommitId: null,
        selectedCommitDetail: null,
        detailLoading: false,
        selectedCommitFile: null,
      });
      const path = get().repoPath;
      if (path) {
        saveRepoSession(path, get());
      }
      return;
    }

    if (get().selectedCommitId === commitId && get().selectedCommitDetail?.id === commitId) {
      return;
    }

    // 先只改选中 id，列表高亮立刻响应；切换提交清空文件对比选中
    set({
      selectedCommitId: commitId,
      selectedCommitFile: null,
      error: null,
    });

    const repoPathForCache = get().repoPath;
    const cached =
      repoPathForCache != null ? getCachedCommitDetail(repoPathForCache, commitId) : null;
    if (cached) {
      set({
        selectedCommitDetail: cached,
        detailLoading: false,
      });
      if (repoPathForCache) {
        saveRepoSession(repoPathForCache, get());
      }
      return;
    }

    // 清空旧详情，避免大文件列表挡住点击反馈
    set({
      selectedCommitDetail: null,
      detailLoading: true,
    });

    const repoPath = requireRepoPath(get().repoPath);
    try {
      const result = await gitService.getCommit(repoPath, commitId);
      cacheCommitDetail(repoPath, result.commit);
      // 若用户已点了另一条或已切仓，丢弃过期结果
      if (get().selectedCommitId !== commitId || get().repoPath !== repoPath) {
        return;
      }
      set({
        selectedCommitDetail: result.commit,
        detailLoading: false,
      });
      saveRepoSession(repoPath, get());
    } catch (error) {
      if (get().repoPath === repoPath && get().selectedCommitId === commitId) {
        set({
          selectedCommitDetail: null,
          detailLoading: false,
          error: toUserMessage(error),
        });
      }
      throw error;
    }
  },

  async stage(paths) {
    // 不拉全局 loading：否则变更行悬停按钮的 disabled:opacity-50 会盖过 opacity-0，整表闪一下
    set({ error: null });
    const repoPath = requireRepoPath(get().repoPath);
    const entries = get().status?.entries ?? [];

    try {
      const hasConflictPath = paths.some((path) => {
        const entry = entries.find((item) => item.path === path);
        return entry ? isConflictEntry(entry) : false;
      });
      // 冲突文件禁止改变暂存状态
      if (hasConflictPath) {
        throwValidationError(i18n.t("repo.conflictStageLocked"));
      }
      await gitService.stage(repoPath, paths);
      const status = await gitService.getStatus(repoPath);
      applyStatusResult(repoPath, status, set, get);
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    }
  },

  async unstage(paths) {
    set({ error: null });
    const repoPath = requireRepoPath(get().repoPath);
    const entries = get().status?.entries ?? [];

    try {
      const hasConflictPath = paths.some((path) => {
        const entry = entries.find((item) => item.path === path);
        return entry ? isConflictEntry(entry) : false;
      });
      // 冲突文件禁止取消暂存（不可放回变更）
      if (hasConflictPath) {
        throwValidationError(i18n.t("repo.conflictStageLocked"));
      }
      await gitService.unstage(repoPath, paths);
      const status = await gitService.getStatus(repoPath);
      applyStatusResult(repoPath, status, set, get);
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    }
  },

  async stageAll() {
    set({ error: null });
    const repoPath = requireRepoPath(get().repoPath);

    try {
      if (get().repoPath === repoPath) {
        set({ demotedConflictPaths: [] });
      }
      await gitService.stageAll(repoPath);
      const status = await gitService.getStatus(repoPath);
      applyStatusResult(repoPath, status, set, get);
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    }
  },

  async discard(paths) {
    set({ error: null });
    const repoPath = requireRepoPath(get().repoPath);
    const entries = get().status?.entries ?? [];

    try {
      if (paths.length === 0) {
        throwValidationError(i18n.t("repo.discardEmpty"));
      }
      const hasConflictPath = paths.some((path) => {
        const entry = entries.find((item) => item.path === path);
        return entry ? isConflictEntry(entry) : false;
      });
      if (hasConflictPath) {
        throwValidationError(i18n.t("repo.conflictDiscardLocked"));
      }
      await gitService.discard(repoPath, paths);
      const status = await gitService.getStatus(repoPath);
      applyStatusResult(repoPath, status, set, get);
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    }
  },

  async unstageAll() {
    set({ error: null });
    const repoPath = requireRepoPath(get().repoPath);
    const entries = get().status?.entries ?? [];

    try {
      // 冲突文件保持在待提交；仅取消暂存其余文件
      const gitPaths = entries
        .filter(
          (entry) =>
            !isConflictEntry(entry) && entry.indexStatus !== "." && entry.indexStatus !== "?",
        )
        .map((entry) => entry.path);
      if (gitPaths.length === 0) {
        if (entries.some(isConflictEntry)) {
          throwValidationError(i18n.t("repo.conflictStageLocked"));
        }
        return;
      }
      await gitService.unstage(repoPath, gitPaths);
      const status = await gitService.getStatus(repoPath);
      applyStatusResult(repoPath, status, set, get);
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    }
  },

  async commit() {
    const repoPath = requireRepoPath(get().repoPath);
    const message = get().commitMessage.trim();

    if (!message) {
      throwValidationError(i18n.t("repo.errors.emptyMessage"));
    }

    if (!hasConfiguredGitIdentity(get().identity)) {
      // 无 name/email 时 Git 会失败；先拦截并引导去设置
      throwValidationError(i18n.t("repo.errors.noGitIdentity"));
    }

    const sequencerInProgress = Boolean(get().repoState?.merging);
    if (get().status?.detached && !sequencerInProgress) {
      // 检出标签等会进入分离 HEAD；禁止普通提交以免提交悬空
      throwValidationError(i18n.t("repo.commitDetachedHint"));
    }

    const stagedEntries = (get().status?.entries ?? []).filter(
      (entry) => entry.indexStatus !== "." && entry.indexStatus !== "?",
    );
    // 合并/变基进行中：即使 UI 暂存列表为空也允许提交以结束操作
    if (stagedEntries.length === 0 && !sequencerInProgress) {
      throwValidationError(i18n.t("repo.errors.nothingToCommit"));
    }

    // 普通提交：按「待提交」重建 index；合并中后端会跳过 reset，直接 commit
    const paths = stagedEntries.map((entry) => entry.path);
    const removePaths = stagedEntries.flatMap((entry) => {
      const removed: string[] = [];
      if (entry.indexStatus === "D") {
        removed.push(entry.path);
      }
      if (entry.renamedFrom) {
        removed.push(entry.renamedFrom);
      }
      return removed;
    });
    // 切仓后仍按发起时的 log 偏好刷新历史
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;

    beginLoadingOp(repoPath, set, get);
    try {
      const commitId = await gitService.commit(repoPath, message, {
        paths,
        removePaths,
      });
      const [status, log, repoState] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        ),
        gitService.getRepoState(repoPath),
      ]);

      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, {
          status,
          commits: log.commits,
          hasMore: log.hasMore,
          commitMessage: "",
          repoState,
        });
        return commitId;
      }

      set({
        status,
        ...statusSelectionPatch(get, status),
        commits: log.commits,
        hasMore: log.hasMore,
        commitMessage: "",
        repoState,
      });
      saveRepoSession(repoPath, get());

      return commitId;
    } catch (error) {
      // Rust 侧已尝试还原 lint-staged 备份；此处再兜底并刷新 status，避免 UI 卡在「空变更」
      let restoredBackup = false;
      try {
        const restore = await gitService.restoreLintStagedBackup(repoPath);
        restoredBackup = restore.restored;
      } catch (restoreError) {
        // 二次救场失败不掩盖原始提交错误，但保留诊断信息。
        console.warn("[repo] retry commit recovery failed", restoreError);
      }
      try {
        const status = await gitService.getStatus(repoPath);
        if (get().repoPath === repoPath) {
          set({ status, ...statusSelectionPatch(get, status) });
        } else {
          patchRepoSession(repoPath, { status });
        }
      } catch (refreshError) {
        // status 刷新失败不掩盖提交错误，但保留诊断信息。
        console.warn("[repo] refresh status after commit failure failed", refreshError);
      }
      setError(set, get, repoPath, error);
      if (restoredBackup) {
        const wrapped =
          error && typeof error === "object" ? { ...error, restoredLintStagedBackup: true } : error;
        throw wrapped;
      }
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async amendMessage(rev, message) {
    const repoPath = requireRepoPath(get().repoPath);
    const trimmed = message.trim();
    if (!trimmed) {
      throwValidationError(i18n.t("repo.errors.emptyMessage"));
    }
    if (!hasConfiguredGitIdentity(get().identity)) {
      throwValidationError(i18n.t("repo.errors.noGitIdentity"));
    }
    assertWriteOpAllowed(get);
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;

    beginLoadingOp(repoPath, set, get);
    try {
      const commitId = await gitService.amendMessage(repoPath, rev, trimmed);
      const [status, log, branches] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        ),
        gitService.listBranches(repoPath, true),
      ]);

      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, {
          status,
          commits: log.commits,
          hasMore: log.hasMore,
          branches,
          selectedCommitId: commitId,
        });
        return commitId;
      }

      set({
        status,
        ...statusSelectionPatch(get, status),
        commits: log.commits,
        hasMore: log.hasMore,
        branches,
        selectedCommitId: commitId,
        selectedCommitDetail: null,
      });
      saveRepoSession(repoPath, get());
      // 详情按新 id 重拉
      void get()
        .selectCommit(commitId)
        .catch(() => {
          // 选中失败不阻断 amend 成功
        });

      return commitId;
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async undoCommit() {
    set({ error: null });
    const repoPath = requireRepoPath(get().repoPath);
    const ahead = get().status?.ahead ?? 0;
    if (ahead <= 0) {
      throwValidationError(i18n.t("repo.errors.nothingToUndo"));
    }

    const commits = get().commits;
    const undone = commits[0] ?? null;
    const originMessage = get().commitMessage;
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;
    // 回退到父提交；无父则交给后端（首提交会返回明确错误）
    const target = commits[1]?.id;

    beginLoadingOp(repoPath, set, get);
    try {
      const result = await gitService.undoCommit(repoPath, target);
      const [status, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        ),
      ]);

      const commitMessage = undone?.subject ?? originMessage;
      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, {
          status,
          commits: log.commits,
          hasMore: log.hasMore,
          commitMessage,
          selectedCommitId: null,
        });
        return result;
      }

      set({
        status,
        ...statusSelectionPatch(get, status),
        commits: log.commits,
        hasMore: log.hasMore,
        // 把撤销的提交说明填回输入框，便于改完再提交
        commitMessage,
        selectedCommitId: null,
        selectedCommitDetail: null,
        selectedCommitFile: null,
      });
      saveRepoSession(repoPath, get());

      return result;
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async merge(source, options) {
    assertWriteOpAllowed(get);
    const repoPath = requireRepoPath(get().repoPath);
    const ref = source.trim();
    if (!ref) {
      throwValidationError(i18n.t("repo.errors.emptyBranchName"));
    }
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;
    const originConflictState = {
      commitMessage: get().commitMessage,
      conflictFocusEpoch: get().conflictFocusEpoch,
      demotedConflictPaths: get().demotedConflictPaths,
      selectedChange: get().selectedChange,
    };

    beginLoadingOp(repoPath, set, get);
    try {
      const result = await gitService.merge(repoPath, ref, options);
      const [branches, log] = await Promise.all([
        gitService.listBranches(repoPath, true),
        gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        ),
      ]);

      await syncAfterConflictOp(repoPath, set, get, originConflictState, {
        focusConflict: result.conflict,
        preferMergeMessage: result.conflict,
      });

      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, {
          branches,
          commits: log.commits,
          hasMore: log.hasMore,
        });
        return result;
      }

      set({
        branches,
        commits: log.commits,
        hasMore: log.hasMore,
      });
      saveRepoSession(repoPath, get());

      return result;
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async checkout(ref) {
    assertWriteOpAllowed(get);
    const repoPath = requireRepoPath(get().repoPath);
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;
    const syncCheckoutState = async (): Promise<void> => {
      const [status, branches, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
        gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        ),
      ]);

      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, {
          status,
          branches,
          commits: log.commits,
          hasMore: log.hasMore,
        });
        return;
      }

      set({
        status,
        ...statusSelectionPatch(get, status),
        branches,
        commits: log.commits,
        hasMore: log.hasMore,
      });
      saveRepoSession(repoPath, get());
    };

    beginLoadingOp(repoPath, set, get);
    try {
      await gitService.checkout(repoPath, ref);
      await syncCheckoutState();
    } catch (error) {
      // Git 复合命令可能已经切换 HEAD；失败路径同样以磁盘真实状态为准。
      try {
        await syncCheckoutState();
      } catch (refreshError) {
        console.warn("[checkout] failed to refresh repository state", refreshError);
      }
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async createBranch(name, options) {
    const repoPath = requireRepoPath(get().repoPath);
    const trimmed = name.trim();
    if (!trimmed) {
      throwValidationError(i18n.t("repo.errors.emptyBranchName"));
    }
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;

    beginLoadingOp(repoPath, set, get);
    try {
      await gitService.createBranch(repoPath, trimmed, {
        checkout: options?.checkout ?? true,
        startPoint: options?.startPoint,
      });

      const [status, branches, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
        gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        ),
      ]);

      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, {
          status,
          branches,
          commits: log.commits,
          hasMore: log.hasMore,
        });
        return;
      }

      set({
        status,
        ...statusSelectionPatch(get, status),
        branches,
        commits: log.commits,
        hasMore: log.hasMore,
      });
      saveRepoSession(repoPath, get());
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async deleteBranch(name, options) {
    const repoPath = requireRepoPath(get().repoPath);
    const trimmed = name.trim();
    if (!trimmed) {
      throwValidationError(i18n.t("repo.errors.emptyBranchName"));
    }

    beginLoadingOp(repoPath, set, get);
    try {
      await gitService.deleteBranch(repoPath, trimmed, options);
      const [status, branches] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
      ]);

      if (get().repoPath === repoPath) {
        set({ status, ...statusSelectionPatch(get, status), branches });
        saveRepoSession(repoPath, get());
      } else {
        patchRepoSession(repoPath, { status, branches });
      }
    } catch (error) {
      try {
        const [status, branches] = await Promise.all([
          gitService.getStatus(repoPath),
          gitService.listBranches(repoPath, true),
        ]);
        if (get().repoPath === repoPath) {
          set({
            status,
            ...statusSelectionPatch(get, status),
            branches,
          });
          saveRepoSession(repoPath, get());
        } else {
          patchRepoSession(repoPath, { status, branches });
        }
      } catch (refreshError) {
        console.warn("[deleteBranch] failed to refresh repository state", refreshError);
      }
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async renameBranch(oldName, newName) {
    const repoPath = requireRepoPath(get().repoPath);
    const from = oldName.trim();
    const to = newName.trim();
    if (!from || !to) {
      throwValidationError(i18n.t("repo.errors.emptyBranchName"));
    }
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;

    beginLoadingOp(repoPath, set, get);
    try {
      await gitService.renameBranch(repoPath, from, to);
      const [status, branches, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
        gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        ),
      ]);

      if (get().repoPath === repoPath) {
        set({
          status,
          ...statusSelectionPatch(get, status),
          branches,
          commits: log.commits,
          hasMore: log.hasMore,
        });
        saveRepoSession(repoPath, get());
      } else {
        patchRepoSession(repoPath, {
          status,
          branches,
          commits: log.commits,
          hasMore: log.hasMore,
        });
      }
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async fetch(remote) {
    const repoPath = requireRepoPath(get().repoPath);

    beginLoadingOp(repoPath, set, get);
    try {
      const result = await gitService.fetch(repoPath, remote);
      const [status, branches] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
      ]);

      if (get().repoPath === repoPath) {
        set({ status, ...statusSelectionPatch(get, status), branches });
        saveRepoSession(repoPath, get());
      } else {
        patchRepoSession(repoPath, { status, branches });
      }
      return { remote: result.remote, elapsedMs: result.elapsedMs };
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async pull(options) {
    assertWriteOpAllowed(get);
    const repoPath = requireRepoPath(get().repoPath);
    const logRef = get().logRef;
    const logOrder = get().logOrder;
    const historyAdvanced = get().historyAdvanced;
    const originConflictState = {
      commitMessage: get().commitMessage,
      conflictFocusEpoch: get().conflictFocusEpoch,
      demotedConflictPaths: get().demotedConflictPaths,
      selectedChange: get().selectedChange,
    };

    beginLoadingOp(repoPath, set, get);
    try {
      const result = await gitService.pull(repoPath, options);
      const [branches, log] = await Promise.all([
        gitService.listBranches(repoPath, true),
        gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        ),
      ]);
      // 冲突时也刷新 status（不再吞掉现场）
      await syncAfterConflictOp(repoPath, set, get, originConflictState, {
        focusConflict: result.conflict,
        preferMergeMessage: result.conflict,
      });

      if (get().repoPath === repoPath) {
        set({
          branches,
          commits: log.commits,
          hasMore: log.hasMore,
        });
        saveRepoSession(repoPath, get());
      } else {
        patchRepoSession(repoPath, {
          branches,
          commits: log.commits,
          hasMore: log.hasMore,
        });
      }
      return {
        ok: result.ok,
        conflict: result.conflict,
        remote: result.remote,
        elapsedMs: result.elapsedMs,
      };
    } catch (error) {
      // 尽量刷新，避免 UI 停留在冲突前的干净状态
      try {
        await syncAfterConflictOp(repoPath, set, get, originConflictState, {
          focusConflict: true,
        });
      } catch {
        /* ignore */
      }
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async push(options) {
    set({ error: null });
    // 允许调用方锁定发起时的路径，避免 await 间隙切标签后推到其它仓
    const repoPath = options?.repoPath?.trim()
      ? options.repoPath.trim()
      : requireRepoPath(get().repoPath);
    const session = get().repoPath === repoPath ? null : (repoSessionCache.get(repoPath) ?? null);
    const statusForBranch = get().repoPath === repoPath ? get().status : (session?.status ?? null);
    const logRef = get().repoPath === repoPath ? get().logRef : (session?.logRef ?? null);
    const logOrder =
      get().repoPath === repoPath ? get().logOrder : (session?.logOrder ?? get().logOrder);
    const historyAdvanced =
      get().repoPath === repoPath
        ? get().historyAdvanced
        : (session?.historyAdvanced ?? { ...EMPTY_HISTORY_ADVANCED_FILTERS });

    beginLoadingOp(repoPath, set, get);

    try {
      // 对齐 ugit：默认 origin + 当前分支 → push --progress origin main:main
      const remote = options?.remote ?? "origin";
      const branch =
        options?.branch ??
        (statusForBranch?.detached ? undefined : (statusForBranch?.branch ?? undefined));
      const result = await gitService.push(repoPath, {
        remote,
        branch,
        setUpstream: options?.setUpstream,
        force: options?.force,
      });
      const [nextStatus, branches, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
        gitService.getLog(
          repoPath,
          buildHistoryLogOptions({
            limit: LOG_PAGE_SIZE,
            logRef,
            order: logOrder,
            advanced: historyAdvanced,
          }),
        ),
      ]);

      if (get().repoPath !== repoPath) {
        patchRepoSession(repoPath, {
          status: nextStatus,
          branches,
          commits: log.commits,
          hasMore: log.hasMore,
        });
        return { remote: result.remote, elapsedMs: result.elapsedMs };
      }

      set({
        status: nextStatus,
        ...statusSelectionPatch(get, nextStatus),
        branches,
        commits: log.commits,
        hasMore: log.hasMore,
      });
      saveRepoSession(repoPath, get());
      return { remote: result.remote, elapsedMs: result.elapsedMs };
    } catch (error) {
      setError(set, get, repoPath, error);
      throw error;
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },

  async holdLoading(fn) {
    const repoPath = requireRepoPath(get().repoPath);
    beginLoadingOp(repoPath, set, get);
    try {
      return await fn();
    } finally {
      endLoadingOp(repoPath, set, get);
    }
  },
}));
