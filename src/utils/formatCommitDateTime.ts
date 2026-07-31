import dayjs from "dayjs";

/** 提交列表 / 详情统一：本地日历年月日时分秒 */
export const COMMIT_DATETIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

export function formatCommitDateTime(value: string | number | Date | null | undefined): string {
  if (value == null || value === "") {
    return "";
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return "";
  }
  return parsed.format(COMMIT_DATETIME_FORMAT);
}
