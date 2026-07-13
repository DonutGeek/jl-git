import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";

export type OpLogLabel = "commit" | "fetch" | "pull" | "push" | string;

export type OpLogStatus = "running" | "success" | "error";

export interface OpLogLine {
  text: string;
}

export interface OpLogEntry {
  id: string;
  repoPath: string;
  label: OpLogLabel;
  status: OpLogStatus;
  startedAt: string;
  elapsedMs?: number;
  error?: string;
  lines: OpLogLine[];
  /** 当前正在执行的命令（仅 running 时有值，用于 loading 文案） */
  activeCmd?: string;
}

type GitOpEvent =
  | {
      kind: "start";
      opId: string;
      repoPath: string;
      label: string;
      startedAt: string;
    }
  | {
      kind: "cmdStart";
      opId: string;
      repoPath: string;
      args: string[];
      startedAt: string;
    }
  | {
      kind: "cmd";
      opId: string;
      repoPath: string;
      args: string[];
      stdout: string;
      stderr: string;
      code: number;
      elapsedMs: number;
      startedAt: string;
    }
  | {
      kind: "end";
      opId: string;
      repoPath: string;
      label: string;
      ok: boolean;
      elapsedMs: number;
      error?: string | null;
    };

const MAX_PER_REPO = 50;
const EVENT = "jlgit://git-op";

interface OpLogState {
  /** repoPath → 旧到新（最新在末尾） */
  byRepo: Record<string, OpLogEntry[]>;
  panelOpen: boolean;
  expandedIds: Record<string, boolean>;
  /** 成功自动关闭所绑定的 opId；新操作会取消 */
  autoCloseOpId: string | null;
  /** 已点开面板、等待首个 start 事件 */
  pendingReveal: boolean;
  setPanelOpen: (open: boolean) => void;
  /** 用户点击操作时立刻打开面板（不等 start 事件） */
  openPanelNow: () => void;
  togglePanel: () => void;
  toggleExpanded: (id: string) => void;
  handleEvent: (event: GitOpEvent) => void;
}

let autoCloseTimer: number | null = null;

function clearAutoCloseTimer(): void {
  if (autoCloseTimer != null) {
    window.clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
}

/** 操作成功后稍作停留再关面板，便于看清步骤与结果；若仍有 running 则不关 */
function scheduleAutoClose(opId: string): void {
  clearAutoCloseTimer();
  useOpLogStore.setState({ autoCloseOpId: opId });
  autoCloseTimer = window.setTimeout(() => {
    const state = useOpLogStore.getState();
    if (state.autoCloseOpId !== opId) {
      return;
    }
    const hasRunning = Object.values(state.byRepo).some((list) =>
      list.some((entry) => entry.status === "running"),
    );
    if (hasRunning) {
      return;
    }
    useOpLogStore.setState({ panelOpen: false, autoCloseOpId: null });
  }, 1200);
}

function formatGitCmd(args: string[]): string {
  return `git ${args.join(" ")}`;
}

function formatCmdStartLine(
  event: Extract<GitOpEvent, { kind: "cmdStart" }>,
): OpLogLine {
  return { text: `[${event.startedAt}]开始: ${formatGitCmd(event.args)}` };
}

/** cmd 完成：输出 + 完成/失败（开始行已由 cmdStart 写入） */
function formatCmdFinishLines(
  event: Extract<GitOpEvent, { kind: "cmd" }>,
): OpLogLine[] {
  const cmd = formatGitCmd(event.args);
  const seconds = (event.elapsedMs / 1000).toFixed(3);
  const lines: OpLogLine[] = [];

  const output = stripAnsi([event.stdout, event.stderr].filter((part) => part.trim().length > 0).join("\n").trim());
  if (output) {
    for (const line of output.split("\n")) {
      lines.push({ text: `[${event.startedAt}]${line}` });
    }
  }

  if (event.code === 0) {
    lines.push({ text: `[${event.startedAt}]完成: ${cmd}(${seconds}s)` });
  } else {
    lines.push({
      text: `[${event.startedAt}]失败: ${cmd}(exit ${event.code}, ${seconds}s)`,
    });
  }

  return lines;
}

/** 去掉日志中的 ANSI，避免面板出现 `38;2` / `[1m` 乱码 */
function stripAnsi(input: string): string {
  return input
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b./g, "");
}

function upsertEntry(
  list: OpLogEntry[],
  entry: OpLogEntry,
): OpLogEntry[] {
  const index = list.findIndex((item) => item.id === entry.id);
  if (index === -1) {
    return [...list, entry].slice(-MAX_PER_REPO);
  }
  const next = [...list];
  next.splice(index, 1);
  next.push(entry);
  return next.slice(-MAX_PER_REPO);
}

/** 仅展开一条：优先 running，否则各仓库最新一条（列表末尾） */
function pickDefaultExpanded(
  byRepo: Record<string, OpLogEntry[]>,
): Record<string, boolean> {
  for (const list of Object.values(byRepo)) {
    const running = list.find((entry) => entry.status === "running");
    if (running) {
      return { [running.id]: true };
    }
  }
  const next: Record<string, boolean> = {};
  for (const list of Object.values(byRepo)) {
    const latest = list[list.length - 1];
    if (latest) {
      next[latest.id] = true;
    }
  }
  return next;
}

export const useOpLogStore = create<OpLogState>((set, get) => ({
  byRepo: {},
  panelOpen: false,
  expandedIds: {},
  autoCloseOpId: null,
  pendingReveal: false,

  setPanelOpen(open) {
    if (!open) {
      clearAutoCloseTimer();
      set({ panelOpen: false, autoCloseOpId: null, pendingReveal: false });
      return;
    }
    set((state) => ({
      panelOpen: true,
      pendingReveal: false,
      expandedIds: pickDefaultExpanded(state.byRepo),
    }));
  },

  /** 点击提交/推送等时立刻打开，不等待首个后端事件 */
  openPanelNow() {
    clearAutoCloseTimer();
    set((state) => ({
      panelOpen: true,
      autoCloseOpId: null,
      pendingReveal: true,
      // 先收起旧条目；新操作 start 后再只展开那一条
      expandedIds: pickDefaultExpanded(state.byRepo),
    }));
  },

  togglePanel() {
    const next = !get().panelOpen;
    if (!next) {
      clearAutoCloseTimer();
      set({ panelOpen: false, autoCloseOpId: null, pendingReveal: false });
      return;
    }
    set((state) => ({
      panelOpen: true,
      pendingReveal: false,
      expandedIds: pickDefaultExpanded(state.byRepo),
    }));
  },

  toggleExpanded(id) {
    set((state) => ({
      expandedIds: {
        ...state.expandedIds,
        [id]: !state.expandedIds[id],
      },
    }));
  },

  handleEvent(event) {
    set((state) => {
      const repoPath = event.repoPath;
      const list = state.byRepo[repoPath] ?? [];

      if (event.kind === "start") {
        clearAutoCloseTimer();
        const entry: OpLogEntry = {
          id: event.opId,
          repoPath,
          label: event.label,
          status: "running",
          startedAt: event.startedAt,
          lines: [{ text: `[${event.startedAt}]操作开始: ${event.label}` }],
        };
        return {
          panelOpen: true,
          autoCloseOpId: null,
          pendingReveal: false,
          byRepo: {
            ...state.byRepo,
            [repoPath]: upsertEntry(list, entry),
          },
          // 新操作开始：只展开当前这条
          expandedIds: { [event.opId]: true },
        };
      }

      if (event.kind === "cmdStart") {
        const existing = list.find((item) => item.id === event.opId);
        if (!existing) {
          return state;
        }
        const cmd = formatGitCmd(event.args);
        const entry: OpLogEntry = {
          ...existing,
          activeCmd: cmd,
          lines: [...existing.lines, formatCmdStartLine(event)],
        };
        return {
          byRepo: {
            ...state.byRepo,
            [repoPath]: upsertEntry(list, entry),
          },
          expandedIds: { [event.opId]: true },
        };
      }

      if (event.kind === "cmd") {
        const existing = list.find((item) => item.id === event.opId);
        if (!existing) {
          return state;
        }
        const entry: OpLogEntry = {
          ...existing,
          activeCmd: undefined,
          lines: [...existing.lines, ...formatCmdFinishLines(event)],
        };
        return {
          byRepo: {
            ...state.byRepo,
            [repoPath]: upsertEntry(list, entry),
          },
        };
      }

      // end
      const existing = list.find((item) => item.id === event.opId);
      const base: OpLogEntry = existing ?? {
        id: event.opId,
        repoPath,
        label: event.label,
        status: "running",
        startedAt: "",
        lines: [],
      };
      const entry: OpLogEntry = {
        ...base,
        label: event.label,
        status: event.ok ? "success" : "error",
        elapsedMs: event.elapsedMs,
        error: event.error ?? undefined,
        activeCmd: undefined,
        lines: [
          ...base.lines,
          ...(event.ok
            ? [{ text: `[${base.startedAt || "--:--:--"}]操作成功` }]
            : [
                ...(event.error
                  ? [{ text: `[${base.startedAt || "--:--:--"}]ERROR: ${event.error}` }]
                  : []),
                { text: `[${base.startedAt || "--:--:--"}]操作失败` },
              ]),
        ],
      };

      if (!event.ok) {
        clearAutoCloseTimer();
      }

      return {
        autoCloseOpId: event.ok ? event.opId : null,
        byRepo: {
          ...state.byRepo,
          [repoPath]: upsertEntry(list, entry),
        },
        // 结束时仍只展开本条（失败可看完整输出）
        expandedIds: { [event.opId]: true },
      };
    });

    // 必须在 set 之后关面板：updater 内读到的仍是 running，会误判为仍有进行中操作
    if (event.kind === "end" && event.ok) {
      scheduleAutoClose(event.opId);
    }
  },
}));

let listenStarted = false;
let unlisten: UnlistenFn | null = null;

/** 应用启动时订阅一次 Git 操作日志事件 */
export async function startOpLogListener(): Promise<void> {
  if (listenStarted) {
    return;
  }
  listenStarted = true;

  unlisten = await listen<GitOpEvent>(EVENT, (event) => {
    useOpLogStore.getState().handleEvent(event.payload);
  });
}

export function stopOpLogListener(): void {
  if (unlisten) {
    void unlisten();
    unlisten = null;
  }
  listenStarted = false;
  clearAutoCloseTimer();
}

export function selectRepoEntries(
  byRepo: Record<string, OpLogEntry[]>,
  repoPath: string | null,
): OpLogEntry[] {
  if (!repoPath) {
    return [];
  }
  return byRepo[repoPath] ?? [];
}

export function selectLatestEntry(entries: OpLogEntry[]): OpLogEntry | null {
  return entries[entries.length - 1] ?? null;
}
