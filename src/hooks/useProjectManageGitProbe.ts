import { useEffect, useMemo, useRef, useState } from "react";

import { gitService, pickPrimaryRemoteUrl } from "@/services/git";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";
import type { ManageGitProbeLite } from "@/utils/projectManageFilter";

export type ProjectManageGitProbeStatus = "idle" | "loading" | "ready" | "error";

export interface ProjectManageGitSnapshot {
  status: ProjectManageGitProbeStatus;
  branch: string | null;
  detached: boolean;
  dirtyCount: number;
  ahead: number;
  behind: number;
  upstream: string | null;
  remoteUrl: string | null;
  lastSubject: string | null;
  lastAuthoredAt: string | null;
  error?: string;
}

/** 同进程多窗共享 Rust/Git：限制并发，避免主窗一起卡死 */
const PROBE_CONCURRENCY = 2;
/** 首屏画出后再探测，减少与子窗冷启动叠峰 */
const PROBE_START_DELAY_MS = 80;

function toLite(snapshot: ProjectManageGitSnapshot): ManageGitProbeLite {
  return {
    dirtyCount: snapshot.dirtyCount,
    ahead: snapshot.ahead,
    behind: snapshot.behind,
    ready: snapshot.status === "ready",
  };
}

function loadingSnapshot(): ProjectManageGitSnapshot {
  return {
    status: "loading",
    branch: null,
    detached: false,
    dirtyCount: 0,
    ahead: 0,
    behind: 0,
    upstream: null,
    remoteUrl: null,
    lastSubject: null,
    lastAuthoredAt: null,
  };
}

async function probeProject(path: string): Promise<ProjectManageGitSnapshot> {
  const [status, remotes, log] = await Promise.all([
    gitService.getStatus(path),
    gitService.listRemotes(path),
    gitService.getLog(path, { limit: 1, all: true }),
  ]);
  const tip = log.commits[0];
  return {
    status: "ready",
    branch: status.branch,
    detached: status.detached,
    dirtyCount: status.entries.length,
    ahead: status.ahead,
    behind: status.behind,
    upstream: status.upstream,
    remoteUrl: pickPrimaryRemoteUrl(remotes),
    lastSubject: tip?.subject ?? null,
    lastAuthoredAt: tip?.authoredAt ?? null,
  };
}

/** 有限并发跑异步任务，完成顺序不保证 */
async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  let next = 0;
  const limit = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index]);
      }
    }),
  );
}

/**
 * 对给定仓库列表探测 Git 摘要；`refreshToken` 递增时清空缓存并重探。
 * 有限并发 + 合并刷新，避免子窗加载拖死主窗。
 */
export function useProjectManageGitProbe(
  projects: readonly Project[],
  refreshToken = 0,
): {
  snapshots: ReadonlyMap<string, ProjectManageGitSnapshot>;
  lites: ReadonlyMap<string, ManageGitProbeLite>;
} {
  const [snapshots, setSnapshots] = useState<Map<string, ProjectManageGitSnapshot>>(
    () => new Map(),
  );
  const cacheRef = useRef(new Map<string, ProjectManageGitSnapshot>());
  const generationRef = useRef(0);
  const lastRefreshRef = useRef(0);
  const flushScheduledRef = useRef(false);

  const projectKey = useMemo(
    () => projects.map((project) => `${project.id}\u0000${project.path}`).join("\n"),
    [projects],
  );

  const projectList = useMemo(() => [...projects], [projectKey]);

  useEffect(() => {
    if (refreshToken !== lastRefreshRef.current) {
      lastRefreshRef.current = refreshToken;
      cacheRef.current = new Map();
      setSnapshots(new Map());
    }

    const generation = ++generationRef.current;
    // loading 也要重探：Strict Mode / 依赖变更会取消上一轮，cache 里会残留 loading
    const toFetch = projectList.filter((project) => {
      const cached = cacheRef.current.get(project.id);
      return !cached || cached.status === "error" || cached.status === "loading";
    });

    if (toFetch.length === 0) {
      setSnapshots(new Map(cacheRef.current));
      return;
    }

    setSnapshots((prev) => {
      const next = new Map(prev);
      for (const project of toFetch) {
        const loading = loadingSnapshot();
        cacheRef.current.set(project.id, loading);
        next.set(project.id, loading);
      }
      return next;
    });

    function scheduleFlush(): void {
      if (flushScheduledRef.current) {
        return;
      }
      flushScheduledRef.current = true;
      window.requestAnimationFrame(() => {
        flushScheduledRef.current = false;
        if (generation !== generationRef.current) {
          return;
        }
        setSnapshots(new Map(cacheRef.current));
      });
    }

    const startTimer = window.setTimeout(() => {
      void runPool(toFetch, PROBE_CONCURRENCY, async (project) => {
        if (generation !== generationRef.current) {
          return;
        }
        try {
          const snapshot = await probeProject(project.path);
          if (generation !== generationRef.current) {
            return;
          }
          cacheRef.current.set(project.id, snapshot);
        } catch (error) {
          if (generation !== generationRef.current) {
            return;
          }
          cacheRef.current.set(project.id, {
            ...loadingSnapshot(),
            status: "error",
            error: toUserMessage(error),
          });
        }
        scheduleFlush();
      }).then(() => {
        if (generation !== generationRef.current) {
          return;
        }
        setSnapshots(new Map(cacheRef.current));
      });
    }, PROBE_START_DELAY_MS);

    return () => {
      window.clearTimeout(startTimer);
      // 作废进行中探测；清掉未完成的 loading，避免下轮误判为「已在处理」
      generationRef.current += 1;
      for (const [id, snap] of [...cacheRef.current.entries()]) {
        if (snap.status === "loading") {
          cacheRef.current.delete(id);
        }
      }
    };
  }, [projectList, refreshToken]);

  const lites = useMemo(() => {
    const map = new Map<string, ManageGitProbeLite>();
    for (const [id, snapshot] of snapshots) {
      map.set(id, toLite(snapshot));
    }
    return map;
  }, [snapshots]);

  return { snapshots, lites };
}
