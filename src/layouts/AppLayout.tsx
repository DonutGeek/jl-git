import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { RepoTabBar } from "@/components/layout/RepoTabBar";
import { StatusBar } from "@/components/layout/StatusBar";
import { WorkspaceHost } from "@/components/layout/WorkspaceHost";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useShortcutAction } from "@/hooks/useShortcutAction";
import {
  listenOpenProjectInMain,
  listenProjectsChanged,
} from "@/services/window/projectManageBridge";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useOpLogStore } from "@/store/useOpLogStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useSettingsDrawerStore } from "@/store/useSettingsDrawerStore";
import { applyLocalMachineBootstrap } from "@/utils/localMachineBootstrap";
import { applyStartupTabsBootstrap } from "@/utils/startupTabsBootstrap";

const LazySettingsDrawer = lazy(() =>
  import("@/components/settings/SettingsDrawer").then((module) => ({
    default: module.SettingsDrawer,
  })),
);
const LazyOpLogPanel = lazy(() =>
  import("@/components/layout/OpLogPanel").then((module) => ({
    default: module.OpLogPanel,
  })),
);

/** 操作日志首次打开才加载虚拟列表，加载后保持挂载以保留展开状态。 */
function OpLogPanelHost() {
  const open = useOpLogStore((state) => state.panelOpen);
  const [visited, setVisited] = useState(false);

  useEffect(() => {
    if (open) {
      setVisited(true);
    }
  }, [open]);

  if (!open && !visited) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazyOpLogPanel />
    </Suspense>
  );
}

/** 设置首次打开才加载；加载后保持挂载，确保关闭动画与表单草稿不丢失。 */
function SettingsDrawerHost() {
  const open = useSettingsDrawerStore((state) => state.open);
  const [visited, setVisited] = useState(false);

  useEffect(() => {
    if (open) {
      setVisited(true);
    }
  }, [open]);

  if (!open && !visited) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazySettingsDrawer />
    </Suspense>
  );
}

/** 标签栏 + 工作区保活宿主常驻，子路由只负责改 URL */
export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const openNewTab = useOpenTabsStore((state) => state.openNewTab);
  const openRepositoryTab = useOpenTabsStore((state) => state.openRepositoryTab);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadRecent = useProjectStore((state) => state.loadRecent);
  const loadWorkspaces = useProjectStore((state) => state.loadWorkspaces);
  const openSettingsDrawer = useSettingsDrawerStore((state) => state.openDrawer);

  const handleNewTab = useCallback((): void => {
    const tabId = openNewTab();
    navigate(`/tab/${tabId}`);
  }, [navigate, openNewTab]);
  const handleOpenSettings = useCallback((): void => {
    openSettingsDrawer();
  }, [openSettingsDrawer]);

  useShortcutAction("newTab", handleNewTab);
  useShortcutAction("openSettings", handleOpenSettings);
  useKeyboardShortcuts({ repositoryActive: location.pathname.startsWith("/repo/") });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 尽早识别本机 Git 身份 / SSH，不依赖打开设置
      await applyLocalMachineBootstrap();
      if (cancelled) {
        return;
      }
      await applyStartupTabsBootstrap(navigate);
      if (cancelled) {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // 仓库管理子窗：打开仓库 / 列表变更同步
  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

    void listenOpenProjectInMain((projectId) => {
      openRepositoryTab(projectId);
      navigate(`/repo/${projectId}`);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      cleanups.push(unlisten);
    });

    void listenProjectsChanged(() => {
      void Promise.all([loadProjects(), loadRecent(), loadWorkspaces()]);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      cleanups.push(unlisten);
    });

    return () => {
      disposed = true;
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [loadProjects, loadRecent, loadWorkspaces, navigate, openRepositoryTab]);

  return (
    <div className="bg-background text-foreground relative flex h-screen flex-col overflow-hidden">
      <RepoTabBar />
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <WorkspaceHost />
        {/* 占位：让 React Router 仍匹配子路由，实际 UI 由 WorkspaceHost 根据 location 保活渲染 */}
        <div hidden>
          <Outlet />
        </div>
      </main>
      <StatusBar />
      <OpLogPanelHost />
      <SettingsDrawerHost />
    </div>
  );
}
