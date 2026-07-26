import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import { OpLogPanel } from "@/components/layout/OpLogPanel";
import { RepoTabBar } from "@/components/layout/RepoTabBar";
import { StatusBar } from "@/components/layout/StatusBar";
import { WorkspaceHost } from "@/components/layout/WorkspaceHost";
import { SettingsDrawer } from "@/components/settings/SettingsDrawer";
import {
  listenOpenProjectInMain,
  listenProjectsChanged,
} from "@/services/window/projectManageBridge";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { applyLocalMachineBootstrap } from "@/utils/localMachineBootstrap";
import { applyStartupTabsBootstrap } from "@/utils/startupTabsBootstrap";

/** 标签栏 + 工作区保活宿主常驻，子路由只负责改 URL */
export function AppLayout() {
  const navigate = useNavigate();
  const openRepositoryTab = useOpenTabsStore((state) => state.openRepositoryTab);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadRecent = useProjectStore((state) => state.loadRecent);
  const loadWorkspaces = useProjectStore((state) => state.loadWorkspaces);

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
      <OpLogPanel />
      <SettingsDrawer />
    </div>
  );
}
