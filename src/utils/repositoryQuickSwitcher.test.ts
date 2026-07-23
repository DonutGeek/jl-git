import { describe, expect, it } from "vitest";

import {
  projectQuickSwitcherValue,
  sortProjectsForQuickSwitcher,
} from "@/utils/repositoryQuickSwitcher";

import type { Project } from "@/types/project";

function project(
  id: string,
  overrides: Partial<Project> = {},
): Project {
  return {
    id,
    workspaceId: null,
    name: id,
    description: null,
    path: `/repos/${id}`,
    lastOpenedAt: null,
    pinned: false,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("repositoryQuickSwitcher", () => {
  it("按最近打开时间倒序并回退到更新时间", () => {
    const result = sortProjectsForQuickSwitcher([
      project("older", { updatedAt: "2026-01-02T00:00:00.000Z" }),
      project("latest", { lastOpenedAt: "2026-01-04T00:00:00.000Z" }),
      project("middle", { updatedAt: "2026-01-03T00:00:00.000Z" }),
    ]);

    expect(result.map((item) => item.id)).toEqual([
      "latest",
      "middle",
      "older",
    ]);
  });

  it("搜索值同时包含仓库名称、所属分组与路径", () => {
    expect(
      projectQuickSwitcherValue(
        project("demo", {
          name: "鲸灵 Git",
          path: "/Users/demo/JLGit",
        }),
        "工作",
      ),
    ).toBe("鲸灵 Git 工作 /Users/demo/JLGit");
  });
});
