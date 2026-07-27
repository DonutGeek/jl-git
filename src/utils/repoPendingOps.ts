/**
 * 按仓库路径跟踪进行中的重操作（提交 / 加载 / 刷新等）。
 * 切到其他标签再切回时，若该仓仍有未完成操作，应继续显示 loading。
 */

const pendingCounts = new Map<string, number>();

/** 开始一项与 repoPath 绑定的操作 */
export function beginRepoPendingOp(repoPath: string): void {
  pendingCounts.set(repoPath, (pendingCounts.get(repoPath) ?? 0) + 1);
}

/** 结束一项操作；计数归零时移除条目 */
export function endRepoPendingOp(repoPath: string): void {
  const current = pendingCounts.get(repoPath) ?? 0;
  if (current <= 1) {
    pendingCounts.delete(repoPath);
    return;
  }
  pendingCounts.set(repoPath, current - 1);
}

/** 该仓库是否仍有未完成操作 */
export function hasRepoPendingOp(repoPath: string): boolean {
  return (pendingCounts.get(repoPath) ?? 0) > 0;
}

/** 仅测试用：清空全部计数 */
export function clearRepoPendingOpsForTest(): void {
  pendingCounts.clear();
}
