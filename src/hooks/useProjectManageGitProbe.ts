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

function toLite(snapshot: ProjectManageGitSnapshot): ManageGitProbeLite {
  return {
    dirtyCount: snapshot.dirtyCount,
    ahead: snapshot.ahead,
    behind: snapshot.behind,
    ready: snapshot.status === "ready",
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

/**
 * 对给定仓库列表并发探测 Git 摘要；`refreshToken` 递增时清空缓存并重探。
 */
export function useProjectManageGitProbe(
  projects: readonly Project[],
  refreshToken = 0,
): {
  snapshots: ReadonlyMap<string, ProjectManageGitSnapshot>;
  lites: ReadonlyMap<string, ManageGitProbeLite>;
} {
  const [snapshots, setSnapshots] = useState<
    Map<string, ProjectManageGitSnapshot>
  >(() => new Map());
  const cacheRef = useRef(new Map<string, ProjectManageGitSnapshot>());
  const generationRef = useRef(0);
  const lastRefreshRef = useRef(0);

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
    const targets = projectList.filter((project) => {
      const cached = cacheRef.current.get(project.id);
      return !cached || cached.status === "error" || cached.status === "loading";
    });

    // 已有完整缓存时只需同步 state
    const missing = projectList.filter(
      (project) => !cacheRef.current.has(project.id),
    );
    if (missing.length === 0 && targets.every((p) => cacheRef.current.has(p.id))) {
      setSnapshots(new Map(cacheRef.current));
      return;
    }

    const toFetch = projectList.filter((project) => {
      const cached = cacheRef.current.get(project.id);
      return !cached || cached.status === "error";
    });

    if (toFetch.length === 0) {
      setSnapshots(new Map(cacheRef.current));
      return;
    }

    setSnapshots((prev) => {
      const next = new Map(prev);
      for (const project of toFetch) {
        if (!cacheRef.current.has(project.id)) {
          next.set(project.id, {
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
          });
        }
      }
      return next;
    });

    void Promise.all(
      toFetch.map(async (project) => {
        try {
          const snapshot = await probeProject(project.path);
          if (generation !== generationRef.current) {
            return;
          }
          cacheRef.current.set(project.id, snapshot);
          setSnapshots(new Map(cacheRef.current));
        } catch (error) {
          if (generation !== generationRef.current) {
            return;
          }
          cacheRef.current.set(project.id, {
            status: "error",
            branch: null,
            detached: false,
            dirtyCount: 0,
            ahead: 0,
            behind: 0,
            upstream: null,
            remoteUrl: null,
            lastSubject: null,
            lastAuthoredAt: null,
            error: toUserMessage(error),
          });
          setSnapshots(new Map(cacheRef.current));
        }
      }),
    );
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
