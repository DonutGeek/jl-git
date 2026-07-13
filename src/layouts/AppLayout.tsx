import { Outlet } from "react-router-dom";

import { OpLogPanel } from "@/components/layout/OpLogPanel";
import { StatusBar } from "@/components/layout/StatusBar";
import { SettingsDrawer } from "@/components/settings/SettingsDrawer";

export function AppLayout() {
  return (
    <div className="bg-background text-foreground relative flex h-screen flex-col overflow-hidden">
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
      {/* 状态栏 z 高于日志遮罩未覆盖区；日志面板 fixed 且关闭即卸载 */}
      <StatusBar />
      <OpLogPanel />
      <SettingsDrawer />
    </div>
  );
}
