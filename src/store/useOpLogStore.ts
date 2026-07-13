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
  /** repoPath → 新到旧 */
  byRepo: Record<string, OpLogEntry[]>;
  panelOpen: boolean;
  expandedIds: Record<string, boolean>;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  toggleExpanded: (id: string) => void;
  handleEvent: (event: GitOpEvent) => void;
}

function formatCmdLine(event: Extract<GitOpEvent, { kind: "cmd" }>): OpLogLine[] {
  const cmd = `git ${event.args.join(" ")}`;
  const seconds = (event.elapsedMs / 1000).toFixed(3);
  const lines: OpLogLine[] = [
    { text: `[${event.startedAt}]开始: ${cmd}` },
  ];

  const output = [event.stdout, event.stderr]
    .filter((part) => part.trim().length > 0)
    .join("\n")
    .trim();
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

function upsertEntry(
  list: OpLogEntry[],
  entry: OpLogEntry,
): OpLogEntry[] {
  const index = list.findIndex((item) => item.id === entry.id);
  if (index === -1) {
    return [entry, ...list].slice(0, MAX_PER_REPO);
  }
  const next = [...list];
  next[index] = entry;
  // 保持新到旧：running/更新的条目提到最前
  if (index > 0) {
    const [item] = next.splice(index, 1);
    next.unshift(item);
  }
  return next.slice(0, MAX_PER_REPO);
}

export const useOpLogStore = create<OpLogState>((set, get) => ({
  byRepo: {},
  panelOpen: false,
  expandedIds: {},

  setPanelOpen(open) {
    set({ panelOpen: open });
  },

  togglePanel() {
    set({ panelOpen: !get().panelOpen });
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
        const entry: OpLogEntry = {
          id: event.opId,
          repoPath,
          label: event.label,
          status: "running",
          startedAt: event.startedAt,
          lines: [],
        };
        return {
          byRepo: {
            ...state.byRepo,
            [repoPath]: upsertEntry(list, entry),
          },
        };
      }

      if (event.kind === "cmd") {
        const existing = list.find((item) => item.id === event.opId);
        if (!existing) {
          return state;
        }
        const entry: OpLogEntry = {
          ...existing,
          lines: [...existing.lines, ...formatCmdLine(event)],
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
        lines:
          event.ok || !event.error
            ? base.lines
            : [
                ...base.lines,
                { text: `[${base.startedAt || "--:--:--"}]ERROR: ${event.error}` },
              ],
      };

      return {
        byRepo: {
          ...state.byRepo,
          [repoPath]: upsertEntry(list, entry),
        },
        expandedIds: {
          ...state.expandedIds,
          [event.opId]: event.ok ? state.expandedIds[event.opId] : true,
        },
      };
    });
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
  return entries[0] ?? null;
}
