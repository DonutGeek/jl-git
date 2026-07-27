import { describe, expect, it } from "vitest";

import {
  EMPTY_HISTORY_ADVANCED_FILTERS,
  hasActiveAdvancedGitFilters,
  historyAdvancedToLogOptions,
  isAdvancedDateRangeInvalid,
  isAdvancedPathSuspicious,
} from "@/utils/historyAdvancedFilters";

describe("historyAdvancedFilters", () => {
  it("空筛选无活跃 Git 条件", () => {
    expect(hasActiveAdvancedGitFilters(EMPTY_HISTORY_ADVANCED_FILTERS)).toBe(false);
  });

  it("隐藏合并提交不计入活跃高亮（合并开关属偏好，与注释一致）", () => {
    expect(
      hasActiveAdvancedGitFilters({
        ...EMPTY_HISTORY_ADVANCED_FILTERS,
        showMergeCommits: false,
      }),
    ).toBe(false);
  });

  it("任一 Git 检索字段非空则活跃", () => {
    expect(
      hasActiveAdvancedGitFilters({
        ...EMPTY_HISTORY_ADVANCED_FILTERS,
        grep: "feat",
      }),
    ).toBe(true);
  });

  it("转义 author 并映射 noMerges", () => {
    expect(
      historyAdvancedToLogOptions({
        grep: " feat ",
        path: "src/a.ts",
        since: "2026-01-01",
        until: "2026-07-01",
        author: "a.b+c",
        showMergeCommits: false,
      }),
    ).toEqual({
      grep: "feat",
      path: "src/a.ts",
      since: "2026-01-01",
      until: "2026-07-01",
      authors: ["a\\.b\\+c"],
      noMerges: true,
    });
  });

  it("校验日期范围与路径", () => {
    expect(
      isAdvancedDateRangeInvalid({
        since: "2026-07-02",
        until: "2026-07-01",
      }),
    ).toBe(true);
    expect(isAdvancedPathSuspicious("../secret")).toBe(true);
    expect(isAdvancedPathSuspicious("src/ok.ts")).toBe(false);
  });
});
