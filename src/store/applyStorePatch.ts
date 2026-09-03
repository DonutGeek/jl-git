/**
 * 把 Zustand 风格的 `set(partial | (state) => partial)` 接到 Pinia `$patch`。
 * 回调返回原 state 视为无更新（对齐 Zustand）。
 */

function isPatchRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function applyStorePatch<T extends { $patch: (partial: Record<string, unknown>) => void }>(
  inst: T,
  partial: Record<string, unknown> | ((state: T) => unknown),
): void {
  const next = typeof partial === "function" ? partial(inst) : partial;
  if (!isPatchRecord(next) || Object.is(next, inst)) {
    return;
  }
  inst.$patch(next);
}
