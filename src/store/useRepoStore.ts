import { create } from "zustand";

import i18n from "@/i18n";
import { gitService } from "@/services/git";
import { useOpLogStore } from "@/store/useOpLogStore";

import { AppError, toUserMessage } from "@/types/error";
import {
  GitBranch,
  GitCommitDetail,
  GitCommitSummary,
  GitIdentity,
  GitMergeOptions,
  GitMergeResult,
  GitPullResult,
  GitRepoState,
  GitStatusEntry,
  GitStatusResult,
  GitTag,
  GitCreateTagOptions,
  GitTagCreateResult,
} from "@/types/git";
import {
  isConflictEntry,
  isConflictStatus,
  isStagedChangeEntry,
  isUnstagedChangeEntry,
  pruneDemotedConflictPaths,
} from "@/utils/gitConflict";
import {
  hasUnresolvedConflicts,
  isWriteOpBlocked,
} from "@/utils/repoOperationGuard";

/** 先打开操作日志并让出一帧，保证按钮点击后立刻可见 */
async function revealOpLogBeforeInvoke(): Promise<void> {
  useOpLogStore.getState().openPanelNow();
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

const LOG_PAGE_SIZE = 50;
const COMMIT_DETAIL_CACHE_MAX = 24;
/** 多标签会话缓存上限（按最近使用） */
const REPO_SESSION_CACHE_MAX = 8;

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
  commits: GitCommitSummary[];
  hasMore: boolean;
  logRef: string | null;
  commitMessage: string;
  selectedCommitId: string | null;
  selectedChange: SelectedChange | null;
}

const repoSessionCache = new Map<string, RepoSessionSnapshot>();

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
  const existing = repoSessionCache.get(repoPath);
  // 避免 refreshStatus 等局部刷新把空分支列表写回，污染切标签会话缓存
  const branches =
    state.branches.length > 0 || !existing?.branches.length
      ? state.branches
      : existing.branches;
  const tags =
    state.tags.length > 0 || !existing?.tags.length ? state.tags : existing.tags;
  const commits =
    state.commits.length > 0 || !existing?.commits.length
      ? state.commits
      : existing.commits;

  if (repoSessionCache.has(repoPath)) {
    repoSessionCache.delete(repoPath);
  }
  repoSessionCache.set(repoPath, {
    status: state.status,
    identity: state.identity,
    branches,
    tags,
    commits,
    hasMore: state.hasMore,
    logRef: state.logRef,
    commitMessage: state.commitMessage,
    selectedCommitId: state.selectedCommitId,
    selectedChange: state.selectedChange,
  });
  while (repoSessionCache.size > REPO_SESSION_CACHE_MAX) {
    const oldest = repoSessionCache.keys().next().value;
    if (!oldest) {
      break;
    }
    repoSessionCache.delete(oldest);
  }
}

/** 是否已有该仓库的会话缓存（切标签可秒开） */
export function hasRepoSession(repoPath: string): boolean {
  return repoSessionCache.has(repoPath);
}

/** 同步还原会话到 store；命中则返回 true（切标签首帧即可出数） */
export function restoreRepoSession(repoPath: string): boolean {
  const cached = repoSessionCache.get(repoPath);
  if (!cached) {
    return false;
  }

  const detail = cached.selectedCommitId
    ? getCachedCommitDetail(repoPath, cached.selectedCommitId)
    : null;
  const needsDetail = Boolean(cached.selectedCommitId && !detail);

  useRepoStore.setState({
    repoPath,
    status: cached.status,
    identity: cached.identity,
    branches: cached.branches,
    tags: cached.tags,
    commits: cached.commits,
    hasMore: cached.hasMore,
    logRef: cached.logRef,
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
  return true;
}

/** 轻量切仓：只改路径并清空列表，避免同步灌入大缓存造成点击卡顿 */
export function beginRepoSwitch(repoPath: string): void {
  const current = useRepoStore.getState();
  if (current.repoPath === repoPath) {
    return;
  }
  // 离开前写入会话，保留 A 仓的选中提交，返回时可还原
  if (current.repoPath) {
    saveRepoSession(current.repoPath, current);
  }
  useRepoStore.setState({
    repoPath,
    status: null,
    identity: null,
    branches: [],
    tags: [],
    commits: [],
    hasMore: false,
    logRef: null,
    commitMessage: "",
    selectedCommitId: null,
    selectedCommitDetail: null,
    detailLoading: false,
    selectedChange: null,
    selectedCommitFile: null,
    demotedConflictPaths: [],
    loading: true,
    error: null,
  });
}

function demotedSetFrom(paths: readonly string[]): ReadonlySet<string> {
  return new Set(paths);
}

/** 已暂存 / 冲突默认待提交（未 demote） */
function isStagedEntry(
  entry: GitStatusEntry,
  demotedConflictPaths: readonly string[],
): boolean {
  return isStagedChangeEntry(entry, demotedSetFrom(demotedConflictPaths));
}

/** 未暂存 / 被放回变更的冲突 */
function isUnstagedEntry(
  entry: GitStatusEntry,
  demotedConflictPaths: readonly string[],
): boolean {
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
    selectedChange: resolveSelectedChange(
      status,
      get().selectedChange,
      demotedConflictPaths,
    ),
  };
}

interface RepoStoreState {
  repoPath: string | null;
  status: GitStatusResult | null;
  identity: GitIdentity | null;
  branches: GitBranch[];
  tags: GitTag[];
  commits: GitCommitSummary[];
  hasMore: boolean;
  /** 历史列表范围；空值表示当前默认历史。 */
  logRef: string | null;
  commitMessage: string;
  /** 历史列表当前选中的提交 id */
  selectedCommitId: string | null;
  selectedCommitDetail: GitCommitDetail | null;
  detailLoading: boolean;
  /** 变更 / 待提交列表当前选中文件 */
  selectedChange: SelectedChange | null;
  /** 历史详情中选中的改动文件（左侧整区切换为文件前后对比） */
  selectedCommitFile: SelectedCommitFile | null;
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
  refreshRepoState: () => Promise<GitRepoState | null>;
  /** 选中首个冲突文件并请求聚焦变更视图 */
  focusFirstConflict: () => void;
  loadAll: (repoPath: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshTags: () => Promise<void>;
  refreshLog: (reset?: boolean) => Promise<void>;
  selectLogRef: (ref: string | null) => Promise<void>;
  createTag: (options: GitCreateTagOptions) => Promise<GitTagCreateResult>;
  deleteTag: (name: string) => Promise<void>;
  loadMoreLog: () => Promise<void>;
  selectCommit: (commitId: string | null) => Promise<void>;
  stage: (paths: string[]) => Promise<void>;
  unstage: (paths: string[]) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  commit: () => Promise<string>;
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
  }) => Promise<{ remote: string; elapsedMs: number }>;
}

type RepoStore = RepoStoreState & RepoStoreActions;

const initialState: RepoStoreState = {
  repoPath: null,
  status: null,
  identity: null,
  branches: [],
  tags: [],
  commits: [],
  hasMore: false,
  logRef: null,
  commitMessage: "",
  selectedCommitId: null,
  selectedCommitDetail: null,
  detailLoading: false,
  selectedChange: null,
  selectedCommitFile: null,
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
  set: (partial: Partial<RepoStoreState>) => void,
  get: () => RepoStore,
  options?: { focusConflict?: boolean; preferMergeMessage?: boolean },
): Promise<GitRepoState | null> {
  const repoPath = get().repoPath;
  if (!repoPath) {
    return null;
  }
  const [status, repoState] = await Promise.all([
    gitService.getStatus(repoPath),
    gitService.getRepoState(repoPath),
  ]);
  const focusPath =
    options?.focusConflict && repoState.conflictCount > 0
      ? (repoState.conflictPaths[0] ?? firstConflictPath(status))
      : null;

  const nextMessage =
    options?.preferMergeMessage &&
    repoState.mergeMessage &&
    !get().commitMessage.trim()
      ? repoState.mergeMessage
      : get().commitMessage;

  const demotedConflictPaths = pruneDemotedConflictPaths(
    get().demotedConflictPaths,
    status.entries,
  );
  set({
    status,
    repoState,
    demotedConflictPaths,
    commitMessage: nextMessage,
    selectedChange: focusPath
      ? {
          path: focusPath,
          side: demotedConflictPaths.includes(focusPath) ? "worktree" : "index",
        }
      : resolveSelectedChange(status, get().selectedChange, demotedConflictPaths),
    conflictFocusEpoch: focusPath
      ? get().conflictFocusEpoch + 1
      : get().conflictFocusEpoch,
  });
  return repoState;
}

function requireRepoPath(repoPath: string | null): string {
  if (!repoPath) {
    throwValidationError(i18n.t("repo.errors.noRepo"));
  }

  return repoPath;
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

function setError(set: (state: Partial<RepoStoreState>) => void, error: unknown): void {
  set({ error: toUserMessage(error), loading: false });
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
      conflictFocusEpoch: focusConflict
        ? get().conflictFocusEpoch + 1
        : get().conflictFocusEpoch,
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
      set({ repoState });
      return repoState;
    } catch (error) {
      console.warn("[useRepoStore] refreshRepoState failed", error);
      return get().repoState;
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
    set({ selectedCommitFile: file });
  },

  async loadAll(repoPath) {
    const cached = repoSessionCache.get(repoPath);

    // 命中会话缓存：立刻还原 UI，再后台静默刷新（切标签不再整页等待）
    if (cached) {
      const detail = cached.selectedCommitId
        ? getCachedCommitDetail(repoPath, cached.selectedCommitId)
        : null;
      const needsDetail = Boolean(cached.selectedCommitId && !detail);
      set({
        repoPath,
        status: cached.status,
        identity: cached.identity,
        branches: cached.branches,
        tags: cached.tags,
        commits: cached.commits,
        hasMore: cached.hasMore,
        logRef: cached.logRef,
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

      try {
        const [status, identity, branches, tags, log, repoState] = await Promise.all([
          gitService.getStatus(repoPath),
          gitService.getIdentity(repoPath),
          gitService.listBranches(repoPath, true),
          gitService.listTags(repoPath),
          gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE, ref: cached.logRef ?? undefined }),
          gitService.getRepoState(repoPath),
        ]);

        // 用户已切到其他仓库则丢弃本次结果
        if (get().repoPath !== repoPath) {
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
          loading: false,
        });
        saveRepoSession(repoPath, get());
        // 刷新后选中提交可能已不在列表；仍在则补详情
        ensureSelectedCommitDetail();
      } catch (error) {
        if (get().repoPath === repoPath) {
          setError(set, error);
        }
        throw error;
      }
      return;
    }

    // 冷启动：清空旧数据再并行拉取（只清本仓详情，保留其它标签页缓存）
    set({
      repoPath,
      status: null,
      identity: null,
      branches: [],
      tags: [],
      commits: [],
      hasMore: false,
      logRef: null,
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
    clearCommitDetailCacheForRepo(repoPath);

    try {
      const [status, identity, branches, tags, log, repoState] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.getIdentity(repoPath),
        gitService.listBranches(repoPath, true),
        gitService.listTags(repoPath),
        gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
        gitService.getRepoState(repoPath),
      ]);

      if (get().repoPath !== repoPath) {
        return;
      }

      set({
        status,
        identity,
        branches,
        tags: tags.tags,
        commits: log.commits,
        hasMore: log.hasMore,
        repoState,
        loading: false,
      });
      saveRepoSession(repoPath, get());
    } catch (error) {
      if (get().repoPath === repoPath) {
        setError(set, error);
      }
      throw error;
    }
  },

  async refreshStatus() {
    set({ loading: true, error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const [status, repoState] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.getRepoState(repoPath),
      ]);
      set({
        status,
        repoState,
        ...statusSelectionPatch(get, status),
        loading: false,
      });
      saveRepoSession(repoPath, get());
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async refreshBranches() {
    set({ loading: true, error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const branches = await gitService.listBranches(repoPath, true);
      set({ branches, loading: false });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async refreshTags() {
    set({ loading: true, error: null });
    try {
      const repoPath = requireRepoPath(get().repoPath);
      const result = await gitService.listTags(repoPath);
      set({ tags: result.tags, loading: false });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async refreshLog(reset = true) {
    set({ loading: true, error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const currentCommits = get().commits;
      const skip = reset ? 0 : currentCommits.length;
      const log = await gitService.getLog(repoPath, {
        skip,
        limit: LOG_PAGE_SIZE,
        ref: get().logRef ?? undefined,
      });

      set({
        commits: reset ? log.commits : [...currentCommits, ...log.commits],
        hasMore: log.hasMore,
        loading: false,
      });
    } catch (error) {
      setError(set, error);
      throw error;
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

  async createTag(options) {
    try {
      const repoPath = requireRepoPath(get().repoPath);
      const result = await gitService.createTag(repoPath, options);
      await Promise.all([get().refreshTags(), get().refreshLog(true)]);
      return result;
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async deleteTag(name) {
    try {
      const repoPath = requireRepoPath(get().repoPath);
      await gitService.deleteTag(repoPath, name);
      const deletedSelectedRef = get().logRef === name;
      await get().refreshTags();
      if (deletedSelectedRef) {
        await get().selectLogRef(null);
      }
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async loadMoreLog() {
    if (!get().hasMore) {
      return;
    }

    // 不拉全局 loading：避免工具栏/列表整页进入加载态，底部用局部 loadingMore 提示
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const skip = get().commits.length;
      const log = await gitService.getLog(repoPath, {
        skip,
        limit: LOG_PAGE_SIZE,
        ref: get().logRef ?? undefined,
      });

      if (get().repoPath !== repoPath) {
        return;
      }

      set({
        commits: [...get().commits, ...log.commits],
        hasMore: log.hasMore,
      });
      saveRepoSession(repoPath, get());
    } catch (error) {
      setError(set, error);
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

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const result = await gitService.getCommit(repoPath, commitId);
      // 若用户已点了另一条或已切仓，丢弃过期结果
      if (get().selectedCommitId !== commitId || get().repoPath !== repoPath) {
        return;
      }
      cacheCommitDetail(repoPath, result.commit);
      set({
        selectedCommitDetail: result.commit,
        detailLoading: false,
      });
      saveRepoSession(repoPath, get());
    } catch (error) {
      if (get().selectedCommitId === commitId) {
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

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const entries = get().status?.entries ?? [];
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
      set({ status, ...statusSelectionPatch(get, status) });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async unstage(paths) {
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const entries = get().status?.entries ?? [];
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
      set({ status, ...statusSelectionPatch(get, status) });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async stageAll() {
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      await revealOpLogBeforeInvoke();
      set({ demotedConflictPaths: [] });
      await gitService.stageAll(repoPath);
      const status = await gitService.getStatus(repoPath);
      set({ status, ...statusSelectionPatch(get, status) });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async unstageAll() {
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      await revealOpLogBeforeInvoke();
      const entries = get().status?.entries ?? [];
      // 冲突文件保持在待提交；仅取消暂存其余文件
      const gitPaths = entries
        .filter(
          (entry) =>
            !isConflictEntry(entry) &&
            entry.indexStatus !== "." &&
            entry.indexStatus !== "?",
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
      set({ status, ...statusSelectionPatch(get, status) });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async commit() {
    set({ loading: true, error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const message = get().commitMessage.trim();

      if (!message) {
        throwValidationError(i18n.t("repo.errors.emptyMessage"));
      }

      const stagedEntries = (get().status?.entries ?? []).filter(
        (entry) => entry.indexStatus !== "." && entry.indexStatus !== "?",
      );
      if (stagedEntries.length === 0) {
        throwValidationError(i18n.t("repo.errors.nothingToCommit"));
      }

      // ugit 式：按「待提交」列表重建 index 再 commit
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

      await revealOpLogBeforeInvoke();
      const commitId = await gitService.commit(repoPath, message, {
        paths,
        removePaths,
      });
      const [status, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
      ]);

      set({
        status,
        ...statusSelectionPatch(get, status),
        commits: log.commits,
        hasMore: log.hasMore,
        commitMessage: "",
        loading: false,
      });

      return commitId;
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async undoCommit() {
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const ahead = get().status?.ahead ?? 0;
      if (ahead <= 0) {
        throwValidationError(i18n.t("repo.errors.nothingToUndo"));
      }

      const commits = get().commits;
      const undone = commits[0] ?? null;
      // 回退到父提交；无父则交给后端（首提交会返回明确错误）
      const target = commits[1]?.id;

      await revealOpLogBeforeInvoke();
      const result = await gitService.undoCommit(repoPath, target);
      const [status, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
      ]);

      set({
        status,
        ...statusSelectionPatch(get, status),
        commits: log.commits,
        hasMore: log.hasMore,
        // 把撤销的提交说明填回输入框，便于改完再提交
        commitMessage: undone?.subject ?? get().commitMessage,
        selectedCommitId: null,
        selectedCommitDetail: null,
        selectedCommitFile: null,
      });

      return result;
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async merge(source, options) {
    set({ loading: true, error: null });

    try {
      assertWriteOpAllowed(get);
      const repoPath = requireRepoPath(get().repoPath);
      const ref = source.trim();
      if (!ref) {
        throwValidationError(i18n.t("repo.errors.emptyBranchName"));
      }

      await revealOpLogBeforeInvoke();
      const result = await gitService.merge(repoPath, ref, options);
      const [branches, log] = await Promise.all([
        gitService.listBranches(repoPath, true),
        gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
      ]);
      await syncAfterConflictOp(set, get, {
        focusConflict: result.conflict,
        preferMergeMessage: result.conflict,
      });

      set({
        branches,
        commits: log.commits,
        hasMore: log.hasMore,
        loading: false,
      });

      return result;
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async checkout(ref) {
    set({ loading: true, error: null });

    try {
      assertWriteOpAllowed(get);
      const repoPath = requireRepoPath(get().repoPath);
      await revealOpLogBeforeInvoke();
      await gitService.checkout(repoPath, ref);
      const [status, branches, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
        gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
      ]);

      set({
        status,
        ...statusSelectionPatch(get, status),
        branches,
        commits: log.commits,
        hasMore: log.hasMore,
        loading: false,
      });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async createBranch(name, options) {
    set({ loading: true, error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const trimmed = name.trim();
      if (!trimmed) {
        throwValidationError(i18n.t("repo.errors.emptyBranchName"));
      }

      await revealOpLogBeforeInvoke();
      await gitService.createBranch(repoPath, trimmed, {
        checkout: options?.checkout ?? true,
        startPoint: options?.startPoint,
      });

      const [status, branches, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
        gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
      ]);

      set({
        status,
        ...statusSelectionPatch(get, status),
        branches,
        commits: log.commits,
        hasMore: log.hasMore,
        loading: false,
      });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async deleteBranch(name, options) {
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const trimmed = name.trim();
      if (!trimmed) {
        throwValidationError(i18n.t("repo.errors.emptyBranchName"));
      }

      await revealOpLogBeforeInvoke();
      await gitService.deleteBranch(repoPath, trimmed, options);
      const [status, branches] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
      ]);

      set({
        status,
        ...statusSelectionPatch(get, status),
        branches,
      });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async renameBranch(oldName, newName) {
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const from = oldName.trim();
      const to = newName.trim();
      if (!from || !to) {
        throwValidationError(i18n.t("repo.errors.emptyBranchName"));
      }

      await revealOpLogBeforeInvoke();
      await gitService.renameBranch(repoPath, from, to);
      const [status, branches, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
        gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
      ]);

      set({
        status,
        ...statusSelectionPatch(get, status),
        branches,
        commits: log.commits,
        hasMore: log.hasMore,
      });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async fetch(remote) {
    // 不拉全局 loading，避免变更区悬停按钮闪烁；由工具栏本地 busy 控制
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      await revealOpLogBeforeInvoke();
      const result = await gitService.fetch(repoPath, remote);
      const [status, branches] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
      ]);

      set({
        status,
        ...statusSelectionPatch(get, status),
        branches,
      });
      return { remote: result.remote, elapsedMs: result.elapsedMs };
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async pull(options) {
    set({ error: null });

    try {
      assertWriteOpAllowed(get);
      const repoPath = requireRepoPath(get().repoPath);
      await revealOpLogBeforeInvoke();
      const result = await gitService.pull(repoPath, options);
      const [branches, log] = await Promise.all([
        gitService.listBranches(repoPath, true),
        gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
      ]);
      // 冲突时也刷新 status（不再吞掉现场）
      await syncAfterConflictOp(set, get, {
        focusConflict: result.conflict,
        preferMergeMessage: result.conflict,
      });

      set({
        branches,
        commits: log.commits,
        hasMore: log.hasMore,
      });
      return {
        ok: result.ok,
        conflict: result.conflict,
        remote: result.remote,
        elapsedMs: result.elapsedMs,
      };
    } catch (error) {
      // 尽量刷新，避免 UI 停留在冲突前的干净状态
      try {
        await syncAfterConflictOp(set, get, { focusConflict: true });
      } catch {
        /* ignore */
      }
      setError(set, error);
      throw error;
    }
  },

  async push(options) {
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      await revealOpLogBeforeInvoke();
      // 对齐 ugit：默认 origin + 当前分支 → push --progress origin main:main
      const status = get().status;
      const remote = options?.remote ?? "origin";
      const branch =
        options?.branch ??
        (status?.detached ? undefined : (status?.branch ?? undefined));
      const result = await gitService.push(repoPath, {
        ...options,
        remote,
        branch,
      });
      const [nextStatus, branches, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
        gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
      ]);

      set({
        status: nextStatus,
        ...statusSelectionPatch(get, nextStatus),
        branches,
        commits: log.commits,
        hasMore: log.hasMore,
      });
      return { remote: result.remote, elapsedMs: result.elapsedMs };
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },
}));
