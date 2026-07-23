import { describe, expect, it } from "vitest";

import {
  DEFAULT_ACTIVITY_BAR_ORDER,
  moveActivityBarItem,
  normalizeActivityBarOrder,
} from "@/utils/activityBarOrder";

describe("activityBarOrder", () => {
  it("无有效持久化值时返回默认顺序", () => {
    expect(normalizeActivityBarOrder(null)).toEqual(DEFAULT_ACTIVITY_BAR_ORDER);
  });

  it("移除未知项和重复项并补齐缺失入口", () => {
    expect(
      normalizeActivityBarOrder(["agent", "files", "agent", "unknown"]),
    ).toEqual(["search", "agent", "files", "branches", "tags"]);
  });

  it("支持把入口移动到目标位置", () => {
    expect(
      moveActivityBarItem(DEFAULT_ACTIVITY_BAR_ORDER, "search", "branches"),
    ).toEqual(["files", "search", "branches", "tags", "agent"]);
  });

  it("无效拖拽不改变规范化后的顺序", () => {
    expect(
      moveActivityBarItem(["tags", "files"], "unknown", "files"),
    ).toEqual(["tags", "files", "branches", "search", "agent"]);
  });
});
