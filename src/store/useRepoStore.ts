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
  GitStatusEntry,
  GitStatusResult,
} from "@/types/git";

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

/** 提交详情短缓存，减少来回点击时的 git_show 与重渲染 */
const commitDetailCache = new Map<string, GitCommitDetail>();

/** 已打开仓库的会话快照：切标签时先还原，再后台刷新，避免每次冷加载卡顿 */
interface RepoSessionSnapshot {
  status: GitStatusResult | null;
  identity: GitIdentity | null;
  branches: GitBranch[];
  commits: GitCommitSummary[];
  hasMore: boolean;
  commitMessage: string;
  selectedCommitId: string | null;
  selectedChange: SelectedChange | null;
}

const repoSessionCache = new Map<string, RepoSessionSnapshot>();

function cacheCommitDetail(detail: GitCommitDetail): void {
  commitDetailCache.set(detail.id, detail);
  if (commitDetailCache.size <= COMMIT_DETAIL_CACHE_MAX) {
    return;
  }
  const oldest = commitDetailCache.keys().next().value;
  if (oldest) {
    commitDetailCache.delete(oldest);
  }
}

function clearCommitDetailCache(): void {
  commitDetailCache.clear();
}

function saveRepoSession(repoPath: string, state: RepoStoreState): void {
  if (repoSessionCache.has(repoPath)) {
    repoSessionCache.delete(repoPath);
  }
  repoSessionCache.set(repoPath, {
    status: state.status,
    identity: state.identity,
    branches: state.branches,
    commits: state.commits,
    hasMore: state.hasMore,
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

/** 已暂存：index 侧存在实际变更 */
function isStagedEntry(entry: GitStatusEntry): boolean {
  return entry.indexStatus !== "." && entry.indexStatus !== "?";
}

/** 未暂存：worktree 侧为未跟踪或存在实际变更 */
function isUnstagedEntry(entry: GitStatusEntry): boolean {
  return entry.worktreeStatus === "?" || entry.worktreeStatus !== ".";
}

/** status 刷新后校验选中项是否仍在对应列表 */
function resolveSelectedChange(
  status: GitStatusResult | null,
  selected: SelectedChange | null,
): SelectedChange | null {
  if (!selected || !status) {
    return null;
  }
  const entry = status.entries.find((item) => item.path === selected.path);
  if (!entry) {
    return null;
  }
  if (selected.side === "worktree" && isUnstagedEntry(entry)) {
    return selected;
  }
  if (selected.side === "index" && isStagedEntry(entry)) {
    return selected;
  }
  return null;
}

interface RepoStoreState {
  repoPath: string | null;
  status: GitStatusResult | null;
  identity: GitIdentity | null;
  branches: GitBranch[];
  commits: GitCommitSummary[];
  hasMore: boolean;
  commitMessage: string;
  /** 历史列表当前选中的提交 id */
  selectedCommitId: string | null;
  selectedCommitDetail: GitCommitDetail | null;
  detailLoading: boolean;
  /** 变更 / 待提交列表当前选中文件 */
  selectedChange: SelectedChange | null;
  loading: boolean;
  error: string | null;
}

interface RepoStoreActions {
  reset: () => void;
  setRepoPath: (path: string) => void;
  setCommitMessage: (msg: string) => void;
  selectChange: (selection: SelectedChange | null) => void;
  loadAll: (repoPath: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshLog: (reset?: boolean) => Promise<void>;
  loadMoreLog: () => Promise<void>;
  selectCommit: (commitId: string | null) => Promise<void>;
  stage: (paths: string[]) => Promise<void>;
  unstage: (paths: string[]) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  commit: () => Promise<string>;
  /** 撤销最近未推送提交：reset --mixed，变更回到工作区 */
  undoCommit: () => Promise<{ target: string; elapsedMs: number }>;
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
  }) => Promise<{ remote: string; elapsedMs: number }>;
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
  commits: [],
  hasMore: false,
  commitMessage: "",
  selectedCommitId: null,
  selectedCommitDetail: null,
  detailLoading: false,
  selectedChange: null,
  loading: false,
  error: null,
};

function requireRepoPath(repoPath: string | null): string {
  if (!repoPath) {
    throwValidationError(i18n.t("repo.errors.noRepo"));
  }

  return repoPath;
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
    set({ selectedChange: selection });
  },

  async loadAll(repoPath) {
    const cached = repoSessionCache.get(repoPath);

    // 命中会话缓存：立刻还原 UI，再后台静默刷新（切标签不再整页等待）
    if (cached) {
      set({
        repoPath,
        status: cached.status,
        identity: cached.identity,
        branches: cached.branches,
        commits: cached.commits,
        hasMore: cached.hasMore,
        commitMessage: cached.commitMessage,
        selectedCommitId: cached.selectedCommitId,
        selectedCommitDetail: null,
        detailLoading: false,
        selectedChange: cached.selectedChange,
        loading: true,
        error: null,
      });

      try {
        const [status, identity, branches, log] = await Promise.all([
          gitService.getStatus(repoPath),
          gitService.getIdentity(repoPath),
          gitService.listBranches(repoPath, true),
          gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
        ]);

        // 用户已切到其他仓库则丢弃本次结果
        if (get().repoPath !== repoPath) {
          return;
        }

        const selectedChange = resolveSelectedChange(
          status,
          get().selectedChange,
        );
        set({
          status,
          identity,
          branches,
          commits: log.commits,
          hasMore: log.hasMore,
          selectedChange,
          loading: false,
        });
        saveRepoSession(repoPath, get());
      } catch (error) {
        if (get().repoPath === repoPath) {
          setError(set, error);
        }
        throw error;
      }
      return;
    }

    // 冷启动：清空旧数据再并行拉取
    set({
      repoPath,
      status: null,
      identity: null,
      branches: [],
      commits: [],
      hasMore: false,
      commitMessage: "",
      selectedCommitId: null,
      selectedCommitDetail: null,
      detailLoading: false,
      selectedChange: null,
      loading: true,
      error: null,
    });
    clearCommitDetailCache();

    try {
      const [status, identity, branches, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.getIdentity(repoPath),
        gitService.listBranches(repoPath, true),
        gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
      ]);

      if (get().repoPath !== repoPath) {
        return;
      }

      set({
        status,
        identity,
        branches,
        commits: log.commits,
        hasMore: log.hasMore,
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
      const status = await gitService.getStatus(repoPath);
      const selectedChange = resolveSelectedChange(status, get().selectedChange);
      set({ status, selectedChange, loading: false });
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

  async refreshLog(reset = true) {
    set({ loading: true, error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      const currentCommits = get().commits;
      const skip = reset ? 0 : currentCommits.length;
      const log = await gitService.getLog(repoPath, {
        skip,
        limit: LOG_PAGE_SIZE,
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

  async loadMoreLog() {
    if (!get().hasMore) {
      return;
    }

    await get().refreshLog(false);
  },

  async selectCommit(commitId) {
    if (!commitId) {
      set({
        selectedCommitId: null,
        selectedCommitDetail: null,
        detailLoading: false,
      });
      return;
    }

    if (get().selectedCommitId === commitId && get().selectedCommitDetail?.id === commitId) {
      return;
    }

    // 先只改选中 id，列表高亮立刻响应
    set({
      selectedCommitId: commitId,
      error: null,
    });

    const cached = commitDetailCache.get(commitId);
    if (cached) {
      set({
        selectedCommitDetail: cached,
        detailLoading: false,
      });
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
      // 若用户已点了另一条，丢弃过期结果
      if (get().selectedCommitId !== commitId) {
        return;
      }
      cacheCommitDetail(result.commit);
      set({
        selectedCommitDetail: result.commit,
        detailLoading: false,
      });
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
      await gitService.stage(repoPath, paths);
      const status = await gitService.getStatus(repoPath);
      set({
        status,
        selectedChange: resolveSelectedChange(status, get().selectedChange),
      });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async unstage(paths) {
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      await gitService.unstage(repoPath, paths);
      const status = await gitService.getStatus(repoPath);
      set({
        status,
        selectedChange: resolveSelectedChange(status, get().selectedChange),
      });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async stageAll() {
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      await gitService.stageAll(repoPath);
      const status = await gitService.getStatus(repoPath);
      set({
        status,
        selectedChange: resolveSelectedChange(status, get().selectedChange),
      });
    } catch (error) {
      setError(set, error);
      throw error;
    }
  },

  async unstageAll() {
    set({ error: null });

    try {
      const repoPath = requireRepoPath(get().repoPath);
      await gitService.unstageAll(repoPath);
      const status = await gitService.getStatus(repoPath);
      set({
        status,
        selectedChange: resolveSelectedChange(status, get().selectedChange),
      });
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
        selectedChange: resolveSelectedChange(status, get().selectedChange),
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
        selectedChange: resolveSelectedChange(status, get().selectedChange),
        commits: log.commits,
        hasMore: log.hasMore,
        // 把撤销的提交说明填回输入框，便于改完再提交
        commitMessage: undone?.subject ?? get().commitMessage,
        selectedCommitId: null,
        selectedCommitDetail: null,
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
        selectedChange: resolveSelectedChange(status, get().selectedChange),
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
        selectedChange: resolveSelectedChange(status, get().selectedChange),
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
        selectedChange: resolveSelectedChange(status, get().selectedChange),
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
        selectedChange: resolveSelectedChange(status, get().selectedChange),
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
        selectedChange: resolveSelectedChange(status, get().selectedChange),
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
      const repoPath = requireRepoPath(get().repoPath);
      await revealOpLogBeforeInvoke();
      const result = await gitService.pull(repoPath, options);
      // 对齐 ugit：pull 后刷新 status / branches / log
      const [status, branches, log] = await Promise.all([
        gitService.getStatus(repoPath),
        gitService.listBranches(repoPath, true),
        gitService.getLog(repoPath, { limit: LOG_PAGE_SIZE }),
      ]);

      set({
        status,
        selectedChange: resolveSelectedChange(status, get().selectedChange),
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
        selectedChange: resolveSelectedChange(nextStatus, get().selectedChange),
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
