import { describe, expect, it } from "vitest";

import {
  computeHistoryGraphLayout,
  rewriteParentsForVisibleCommits,
} from "./historyGraphLayout";

describe("computeHistoryGraphLayout", () => {
  it("线性历史占单列", () => {
    const layout = computeHistoryGraphLayout([
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    expect(layout.columns).toBe(1);
    expect(layout.rows.map((row) => row.col)).toEqual([0, 0, 0]);
  });

  it("合并提交：主父同列、次父占新列", () => {
    // newest-first：merge → side → mainBase
    const layout = computeHistoryGraphLayout([
      { hash: "merge", parents: ["main", "side"] },
      { hash: "side", parents: ["base"] },
      { hash: "main", parents: ["base"] },
      { hash: "base", parents: [] },
    ]);
    expect(layout.rows[0]?.col).toBe(0);
    expect(layout.rows[0]?.bottomLinks.some((link) => link.toCol === 1)).toBe(true);
    expect(layout.columns).toBeGreaterThanOrEqual(2);
    // 布局不再携带颜色字段
    expect(layout.rows[0]).not.toHaveProperty("color");
  });
});

describe("rewriteParentsForVisibleCommits", () => {
  it("跳过不可见中间提交，接到最近可见祖先", () => {
    const topology = [
      { id: "d", parentIds: ["c"] },
      { id: "c", parentIds: ["b"] },
      { id: "b", parentIds: ["a"] },
      { id: "a", parentIds: [] },
    ];
    const visible = [
      { id: "d", parentIds: ["c"] },
      { id: "a", parentIds: [] },
    ];
    expect(rewriteParentsForVisibleCommits(visible, topology)).toEqual([
      { hash: "d", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
  });

  it("合并两侧不可见时分别落到可见祖先", () => {
    const topology = [
      { id: "merge", parentIds: ["m1", "s1"] },
      { id: "m1", parentIds: ["base"] },
      { id: "s1", parentIds: ["base"] },
      { id: "base", parentIds: [] },
    ];
    const visible = [
      { id: "merge", parentIds: ["m1", "s1"] },
      { id: "base", parentIds: [] },
    ];
    expect(rewriteParentsForVisibleCommits(visible, topology)).toEqual([
      { hash: "merge", parents: ["base"] },
      { hash: "base", parents: [] },
    ]);
  });
});
