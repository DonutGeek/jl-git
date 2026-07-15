import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ProjectManager } from "@/components/project/ProjectManager";

import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";

interface DashboardPageProps {
  /** 为 false 时仅保活隐藏，不跑路由纠偏 */
  active?: boolean;
}

export function DashboardPage({ active = true }: DashboardPageProps) {
  const navigate = useNavigate();
  const { tabId: routeTabId } = useParams<{ tabId: string }>();
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadRecent = useProjectStore((state) => state.loadRecent);
  const loadWorkspaces = useProjectStore((state) => state.loadWorkspaces);
  const tabs = useOpenTabsStore((state) => state.tabs);
  const openNewTab = useOpenTabsStore((state) => state.openNewTab);
  const openRepositoryTab = useOpenTabsStore((state) => state.openRepositoryTab);

  const [error, setError] = useState<string | null>(null);

  const tabId =
    routeTabId ?? tabs.find((tab) => tab.type === "new-tab")?.id ?? undefined;

  useEffect(() => {
    if (!active) {
      return;
    }
    let isMounted = true;

    async function loadDashboard(): Promise<void> {
      try {
        await Promise.all([loadProjects(), loadRecent(), loadWorkspaces()]);
        if (isMounted) {
          setError(null);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(toUserMessage(loadError));
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [active, loadProjects, loadRecent, loadWorkspaces]);

  const isCurrentNewTab = Boolean(
    tabId && tabs.some((tab) => tab.id === tabId && tab.type === "new-tab"),
  );

  useEffect(() => {
    if (!active) {
      return;
    }
    if (isCurrentNewTab) {
      return;
    }

    if (tabId && !tabs.some((tab) => tab.id === tabId)) {
      return;
    }

    const nextTabId = openNewTab();
    navigate(`/tab/${nextTabId}`, { replace: true });
  }, [active, isCurrentNewTab, navigate, openNewTab, tabId, tabs]);

  /** 先登记标签再跳路由；勿 flushSync，避免同步重渲卡住点击 */
  function handleOpenProject(projectId: string): void {
    openRepositoryTab(projectId);
    navigate(`/repo/${projectId}`);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6 pt-6">
        {error ? (
          <p className="text-destructive mb-4 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <ProjectManager onOpenProject={handleOpenProject} />
      </main>
    </div>
  );
}
