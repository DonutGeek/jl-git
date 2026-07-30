import { Activity, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

import { DashboardPage } from "@/pages/DashboardPage";
import { RepoPage } from "@/pages/RepoPage";

import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { resolveActiveOpenTab, shouldClearPendingActivation } from "@/utils/repoTabActivation";

/**
 * 工作区宿主（性能约束）：
 * - 全局仅一份 useRepoStore → 同时只挂一个 RepoPage
 * - 新标签页 Activity 保活；仓库页离开时 hidden 保活
 */
export function WorkspaceHost() {
  const location = useLocation();
  const tabs = useOpenTabsStore((state) => state.tabs);
  const pendingActiveId = useOpenTabsStore((state) => state.pendingActiveId);
  const pendingOriginLocationKey = useOpenTabsStore((state) => state.pendingOriginLocationKey);

  const pendingActivationStale = shouldClearPendingActivation({
    pendingActiveId,
    originLocationKey: pendingOriginLocationKey,
    currentLocationKey: location.key,
  });
  const activeTab = resolveActiveOpenTab(
    location.pathname,
    tabs,
    pendingActivationStale ? null : pendingActiveId,
  );
  const activeRepoId = activeTab?.type === "repository" ? activeTab.projectId : null;
  const showDashboard =
    activeTab?.type === "new-tab" ||
    (!activeTab && (location.pathname === "/" || location.pathname.startsWith("/tab/")));
  const hasNewTab = tabs.some((tab) => tab.type === "new-tab");

  const openRepoIdsKey = useMemo(
    () =>
      tabs
        .filter((tab) => tab.type === "repository")
        .map((tab) => (tab.type === "repository" ? tab.projectId : ""))
        .join("|"),
    [tabs],
  );

  const [mountedRepoId, setMountedRepoId] = useState<string | null>(activeRepoId);

  useEffect(() => {
    if (activeRepoId) {
      setMountedRepoId(activeRepoId);
      return;
    }
    if (!openRepoIdsKey) {
      setMountedRepoId(null);
    }
  }, [activeRepoId, openRepoIdsKey]);

  const repoProjectId = activeRepoId ?? mountedRepoId;
  const repoVisible = Boolean(activeRepoId);

  return (
    <>
      {(showDashboard || hasNewTab) && (
        <Activity mode={showDashboard ? "visible" : "hidden"}>
          <div className="h-full">
            <DashboardPage active={showDashboard} />
          </div>
        </Activity>
      )}

      {repoProjectId ? (
        <div className={cn("h-full", !repoVisible && "hidden")} aria-hidden={!repoVisible}>
          <RepoPage projectId={repoProjectId} active={repoVisible} />
        </div>
      ) : null}
    </>
  );
}
