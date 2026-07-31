import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { ProjectManager } from "@/components/project/ProjectManager";

import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { parseNewTabLocationState } from "@/utils/newTabNavigation";
import { isStartupTabsApplied, onStartupTabsApplied } from "@/utils/startupTabsBootstrap";

import { toUserMessage } from "@/types/error";

interface DashboardPageProps {
  /** 为 false 时仅保活隐藏，不跑路由纠偏 */
  active?: boolean;
}

export function DashboardPage({ active = true }: DashboardPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabId: routeTabId } = useParams<{ tabId: string }>();
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadRecent = useProjectStore((state) => state.loadRecent);
  const loadWorkspaces = useProjectStore((state) => state.loadWorkspaces);
  const tabs = useOpenTabsStore((state) => state.tabs);
  const openNewTab = useOpenTabsStore((state) => state.openNewTab);
  const openRepositoryTab = useOpenTabsStore((state) => state.openRepositoryTab);
  const [startupReady, setStartupReady] = useState(() => isStartupTabsApplied());

  const [error, setError] = useState<string | null>(null);

  useEffect(() => onStartupTabsApplied(() => setStartupReady(true)), []);

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

  // 必须以路由 /tab/:id 命中新标签为准；不能用 store 回退冒充「已激活」
  const routeTabMatch = location.pathname.match(/^\/tab\/([^/]+)/);
  const routeNewTabId = routeTabMatch?.[1] ?? routeTabId ?? null;
  const isCurrentNewTab = Boolean(
    routeNewTabId && tabs.some((tab) => tab.id === routeNewTabId && tab.type === "new-tab"),
  );

  useEffect(() => {
    if (!active || !startupReady) {
      return;
    }
    if (isCurrentNewTab) {
      return;
    }

    // 冷启动引导已导航到仓库标签后不应再强开新标签；仅在无标签时兜底
    if (tabs.length > 0) {
      return;
    }

    const nextTabId = openNewTab();
    navigate(`/tab/${nextTabId}`, { replace: true });
  }, [active, isCurrentNewTab, navigate, openNewTab, startupReady, tabs.length]);

  /** 先登记标签再跳路由；勿 flushSync，避免同步重渲卡住点击 */
  function handleOpenProject(projectId: string): void {
    openRepositoryTab(projectId);
    navigate(`/repo/${projectId}`);
  }

  const requestedView = parseNewTabLocationState(location.state);
  const clearRequestedView = useCallback(() => {
    navigate(".", { replace: true, state: null });
  }, [navigate]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6 pt-6">
        {error ? (
          <p className="text-destructive mb-4 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <ProjectManager
          onOpenProject={handleOpenProject}
          requestedView={requestedView}
          onRequestedViewConsumed={clearRequestedView}
        />
      </main>
    </div>
  );
}
