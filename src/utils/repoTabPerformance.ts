export interface RepoTabSwitchMetric {
  tabId: string;
  durationMs: number;
}

const pendingSwitchStarts = new Map<string, number>();

export function beginRepoTabSwitchMeasure(tabId: string, startedAt = performance.now()): void {
  pendingSwitchStarts.set(tabId, startedAt);
}

export function finishRepoTabSwitchMeasure(
  tabId: string,
  finishedAt = performance.now(),
): RepoTabSwitchMetric | null {
  const startedAt = pendingSwitchStarts.get(tabId);
  if (startedAt == null) {
    return null;
  }
  pendingSwitchStarts.delete(tabId);
  return {
    tabId,
    durationMs: Math.max(0, finishedAt - startedAt),
  };
}

export function resetRepoTabSwitchMeasuresForTest(): void {
  pendingSwitchStarts.clear();
}
