import dayjs from "dayjs";

/** 分支 tip 提交距今 ≤ 该天数视为活跃 */
export const BRANCH_ACTIVITY_DAYS = 90;

/** 分支 tip 提交是否在活跃窗口内 */
export function isBranchActive(tipAuthoredAt: string): boolean {
  const trimmed = tipAuthoredAt.trim();
  if (!trimmed) {
    return false;
  }
  const authored = dayjs(trimmed);
  if (!authored.isValid()) {
    return false;
  }
  return authored.isAfter(dayjs().subtract(BRANCH_ACTIVITY_DAYS, "day"));
}
