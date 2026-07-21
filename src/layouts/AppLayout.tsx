import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import { OpLogPanel } from "@/components/layout/OpLogPanel";
import { RepoTabBar } from "@/components/layout/RepoTabBar";
import { StatusBar } from "@/components/layout/StatusBar";
import { WorkspaceHost } from "@/components/layout/WorkspaceHost";
import { SettingsDrawer } from "@/components/settings/SettingsDrawer";
import { applyStartupTabsBootstrap } from "@/utils/startupTabsBootstrap";

/** 标签栏 + 工作区保活宿主常驻，子路由只负责改 URL */
export function AppLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await applyStartupTabsBootstrap(navigate);
      if (cancelled) {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

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
