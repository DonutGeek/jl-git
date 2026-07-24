import { describe, expect, it } from "vitest";

import { GitStatusEntry } from "@/types/git";

import { filterChangeEntries } from "./filterChangeEntries";

const ENTRIES: GitStatusEntry[] = [
  {
    path: "src/components/git/ChangesPanel.tsx",
    indexStatus: " ",
    worktreeStatus: "M",
  },
  {
    path: "docs/development/ui-guidelines.md",
    indexStatus: "M",
    worktreeStatus: " ",
  },
  {
    path: "src/new-name.ts",
    renamedFrom: "src/old-name.ts",
    indexStatus: "R",
    worktreeStatus: " ",
  },
];

describe("filterChangeEntries", () => {
  it("空搜索词保留全部变更", () => {
    expect(filterChangeEntries(ENTRIES, "  ")).toBe(ENTRIES);
  });

  it("忽略大小写筛选当前路径", () => {
    expect(filterChangeEntries(ENTRIES, "CHANGESPANEL")).toEqual([ENTRIES[0]]);
  });

  it("可通过重命名前路径筛选", () => {
    expect(filterChangeEntries(ENTRIES, "old-name")).toEqual([ENTRIES[2]]);
  });
});
