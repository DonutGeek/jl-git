import { computed, ref, watch, type Ref } from "vue";

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

const PROBE_CONCURRENCY = 2;
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

/** Vue 版 Git 探针：有限并发，避免子窗拖死主窗 */
export function useProjectManageGitProbe(
  projects: Ref<readonly Project[]>,
  refreshToken: Ref<number>,
): {
  snapshots: Ref<ReadonlyMap<string, ProjectManageGitSnapshot>>;
  lites: Ref<ReadonlyMap<string, ManageGitProbeLite>>;
} {
  const snapshots = ref<Map<string, ProjectManageGitSnapshot>>(new Map());
  const cache = new Map<string, ProjectManageGitSnapshot>();
  let generation = 0;
  let lastRefresh = 0;

  watch(
    [() => projects.value.map((item) => `${item.id}\u0000${item.path}`).join("\n"), refreshToken],
    ([, token]) => {
      if (token !== lastRefresh) {
        lastRefresh = token;
        cache.clear();
        snapshots.value = new Map();
      }

      const currentGeneration = ++generation;
      const projectList = [...projects.value];
      const toFetch = projectList.filter((project) => {
        const cached = cache.get(project.id);
        return !cached || cached.status === "error" || cached.status === "loading";
      });

      if (toFetch.length === 0) {
        snapshots.value = new Map(cache);
        return;
      }

      const next = new Map(snapshots.value);
      for (const project of toFetch) {
        const loading = loadingSnapshot();
        cache.set(project.id, loading);
        next.set(project.id, loading);
      }
      snapshots.value = next;

      const startTimer = window.setTimeout(() => {
        void runPool(toFetch, PROBE_CONCURRENCY, async (project) => {
          if (currentGeneration !== generation) {
            return;
          }
          try {
            const snapshot = await probeProject(project.path);
            if (currentGeneration !== generation) {
              return;
            }
            cache.set(project.id, snapshot);
          } catch (error) {
            if (currentGeneration !== generation) {
              return;
            }
            cache.set(project.id, {
              ...loadingSnapshot(),
              status: "error",
              error: toUserMessage(error),
            });
          }
          if (currentGeneration === generation) {
            snapshots.value = new Map(cache);
          }
        }).then(() => {
          if (currentGeneration === generation) {
            snapshots.value = new Map(cache);
          }
        });
      }, PROBE_START_DELAY_MS);

      return () => {
        window.clearTimeout(startTimer);
        generation += 1;
        for (const [id, snap] of [...cache.entries()]) {
          if (snap.status === "loading") {
            cache.delete(id);
          }
        }
      };
    },
    { immediate: true },
  );

  const lites = computed(() => {
    const map = new Map<string, ManageGitProbeLite>();
    for (const [id, snapshot] of snapshots.value) {
      map.set(id, toLite(snapshot));
    }
    return map;
  });

  return { snapshots, lites };
}
