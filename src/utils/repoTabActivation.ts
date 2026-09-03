import type { OpenTab } from "@/store/modules/multipleTab";

export function resolveRoutedTabId(pathname: string, tabs: readonly OpenTab[]): string | null {
  const repositoryMatch = pathname.match(/^\/repo\/([^/]+)/);
  if (repositoryMatch?.[1]) {
    return repositoryMatch[1];
  }

  const newTabMatch = pathname.match(/^\/tab\/([^/]+)/);
  if (newTabMatch?.[1]) {
    return newTabMatch[1];
  }

  if (pathname === "/") {
    return tabs.find((tab) => tab.type === "new-tab")?.id ?? null;
  }

  return null;
}

export function resolveActiveOpenTab(
  pathname: string,
  tabs: readonly OpenTab[],
  pendingActiveId: string | null,
): OpenTab | null {
  if (pendingActiveId) {
    const pending = tabs.find((tab) => tab.id === pendingActiveId);
    if (pending) {
      return pending;
    }
  }

  const routedId = resolveRoutedTabId(pathname, tabs);
  if (!routedId) {
    return null;
  }

  const routed = tabs.find((tab) => tab.id === routedId);
  if (routed) {
    return routed;
  }

  if (pathname.startsWith("/repo/")) {
    return { id: routedId, type: "repository", projectId: routedId };
  }

  if (pathname.startsWith("/tab/")) {
    return { id: routedId, type: "new-tab" };
  }

  return null;
}

interface PendingActivationNavigation {
  pendingActiveId: string | null;
  originLocationKey: string | null;
  currentLocationKey: string;
}

export function shouldClearPendingActivation({
  pendingActiveId,
  originLocationKey,
  currentLocationKey,
}: PendingActivationNavigation): boolean {
  return Boolean(pendingActiveId && originLocationKey && currentLocationKey !== originLocationKey);
}
