import { pathForOpenTab, useOpenTabsStoreWithOut, type OpenTab } from "@/store/modules/multipleTab";
import { useAppPrefsStoreWithOut } from "@/store/modules/app";

export type StartupNavigate = (to: string, options?: { replace?: boolean }) => void;

let startupTabsApplied = false;
const appliedListeners = new Set<() => void>();

export function isStartupTabsApplied(): boolean {
  return startupTabsApplied;
}

/** 冷启动引导完成后通知（Dashboard 等可等待，避免抢先 openNewTab） */
export function onStartupTabsApplied(listener: () => void): () => void {
  if (startupTabsApplied) {
    listener();
    return () => undefined;
  }
  appliedListeners.add(listener);
  return () => {
    appliedListeners.delete(listener);
  };
}

function markStartupTabsApplied(): void {
  startupTabsApplied = true;
  for (const listener of appliedListeners) {
    listener();
  }
  appliedListeners.clear();
}

function resolveStartupTab(
  tabs: readonly OpenTab[],
  lastActiveTabId: string | null,
): OpenTab | null {
  if (tabs.length === 0) {
    return null;
  }
  if (lastActiveTabId) {
    const matched = tabs.find((tab) => tab.id === lastActiveTabId);
    if (matched) {
      return matched;
    }
  }
  return tabs[tabs.length - 1] ?? null;
}

/**
 * 主窗冷启动：按「恢复上次 / 每次新标签」导航一次。
 * 子窗（agent 等）不挂 AppLayout，不会执行。
 */
export async function applyStartupTabsBootstrap(navigate: StartupNavigate): Promise<void> {
  if (startupTabsApplied) {
    return;
  }

  useAppPrefsStoreWithOut();
  useOpenTabsStoreWithOut();

  if (startupTabsApplied) {
    return;
  }

  // 水合后立刻快照，避免与标签栏 effect 竞态读到被改写的 lastActive
  const mode = useAppPrefsStoreWithOut().startupTabsMode;
  const { tabs, lastActiveTabId, setLastActiveTabId, resetToFreshStartup } =
    useOpenTabsStoreWithOut();

  if (mode === "fresh") {
    const id = resetToFreshStartup();
    markStartupTabsApplied();
    navigate(`/tab/${id}`, { replace: true });
    return;
  }

  const tab = resolveStartupTab(tabs, lastActiveTabId);
  if (!tab) {
    const id = resetToFreshStartup();
    markStartupTabsApplied();
    navigate(`/tab/${id}`, { replace: true });
    return;
  }

  setLastActiveTabId(tab.id);
  markStartupTabsApplied();
  navigate(pathForOpenTab(tab), { replace: true });
}
