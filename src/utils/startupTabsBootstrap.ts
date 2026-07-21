import type { NavigateFunction } from "react-router-dom";

import { useAppPrefsStore } from "@/store/useAppPrefsStore";
import {
  pathForOpenTab,
  useOpenTabsStore,
  type OpenTab,
} from "@/store/useOpenTabsStore";

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

function waitForPersistHydration(store: {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
}): Promise<void> {
  if (store.persist.hasHydrated()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const unsub = store.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

function resolveStartupTab(tabs: readonly OpenTab[], lastActiveTabId: string | null): OpenTab | null {
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
export async function applyStartupTabsBootstrap(
  navigate: NavigateFunction,
): Promise<void> {
  if (startupTabsApplied) {
    return;
  }

  await Promise.all([
    waitForPersistHydration(useAppPrefsStore),
    waitForPersistHydration(useOpenTabsStore),
  ]);

  if (startupTabsApplied) {
    return;
  }

  const mode = useAppPrefsStore.getState().startupTabsMode;
  const tabsStore = useOpenTabsStore.getState();

  if (mode === "fresh") {
    const id = tabsStore.resetToFreshStartup();
    markStartupTabsApplied();
    navigate(`/tab/${id}`, { replace: true });
    return;
  }

  const tab = resolveStartupTab(tabsStore.tabs, tabsStore.lastActiveTabId);
  if (!tab) {
    const id = tabsStore.resetToFreshStartup();
    markStartupTabsApplied();
    navigate(`/tab/${id}`, { replace: true });
    return;
  }

  tabsStore.setLastActiveTabId(tab.id);
  markStartupTabsApplied();
  navigate(pathForOpenTab(tab), { replace: true });
}
