import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { RepoTabBar } from "@/components/layout/RepoTabBar";
import { ProjectManager } from "@/components/project/ProjectManager";

import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";

export function DashboardPage() {
  const navigate = useNavigate();
  const { tabId } = useParams<{ tabId: string }>();
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadRecent = useProjectStore((state) => state.loadRecent);
  const loadWorkspaces = useProjectStore((state) => state.loadWorkspaces);
  const tabs = useOpenTabsStore((state) => state.tabs);
  const openNewTab = useOpenTabsStore((state) => state.openNewTab);
  const openRepositoryTab = useOpenTabsStore((state) => state.openRepositoryTab);

  const [error, setError] = useState<string | null>(null);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);

  useEffect(() => {
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
  }, [loadProjects, loadRecent, loadWorkspaces]);

  const isCurrentNewTab = Boolean(
    tabId && tabs.some((tab) => tab.id === tabId && tab.type === "new-tab"),
  );

  useEffect(() => {
    if (isCurrentNewTab) {
      return;
    }

    // 路由 tab id 已不存在时（例如异常中间态）不要强行新建抢导航
    if (tabId && !tabs.some((tab) => tab.id === tabId)) {
      return;
    }

    const nextTabId = openNewTab();
    navigate(`/tab/${nextTabId}`, { replace: true });
  }, [isCurrentNewTab, navigate, openNewTab, tabId, tabs]);

  function handleOpenProject(projectId: string): void {
    if (openingProjectId) {
      return;
    }
    setOpeningProjectId(projectId);
    // 保留当前新标签页，另开仓库标签
    openRepositoryTab(projectId);
    navigate(`/repo/${projectId}`);
  }

  return (
    <div className="bg-background flex h-full flex-col overflow-hidden">
      <RepoTabBar />

      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6 pt-6">
        {error ? (
          <p className="text-destructive mb-4 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <ProjectManager
          onOpenProject={handleOpenProject}
          openingProjectId={openingProjectId}
        />
      </main>
    </div>
  );
}
