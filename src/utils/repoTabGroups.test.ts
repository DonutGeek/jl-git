import { describe, expect, it } from "vitest";

import {
  groupRepoTabs,
  reorderNamedGroupIds,
  resolveRepoTabDropAction,
  resolveWorkspaceGroupSortOrders,
} from "@/utils/repoTabGroups";

describe("groupRepoTabs", () => {
  it("keeps group and item order stable", () => {
    expect(
      groupRepoTabs([
        { workspaceId: "team-a", value: "a" },
        { workspaceId: null, value: "loose" },
        { workspaceId: "team-a", value: "b" },
      ]),
    ).toEqual([
      { key: "workspace:team-a", workspaceId: "team-a", values: ["a", "b"] },
      { key: "ungrouped", workspaceId: null, values: ["loose"] },
    ]);
  });
});

describe("resolveRepoTabDropAction", () => {
  it("reorders only inside the same group", () => {
    expect(
      resolveRepoTabDropAction({
        activeWorkspaceId: "team-a",
        overWorkspaceId: "team-a",
        hasOverTarget: true,
        overIsTab: true,
      }),
    ).toBe("reorder");
  });

  it("ungroups a grouped tab dragged outside its group", () => {
    expect(
      resolveRepoTabDropAction({
        activeWorkspaceId: "team-a",
        overWorkspaceId: "team-b",
        hasOverTarget: true,
        overIsTab: true,
      }),
    ).toBe("ungroup");
    expect(
      resolveRepoTabDropAction({
        activeWorkspaceId: "team-a",
        overWorkspaceId: undefined,
        hasOverTarget: false,
        overIsTab: false,
      }),
    ).toBe("ungroup");
  });

  it("joins a named group when an ungrouped tab is dropped on it", () => {
    expect(
      resolveRepoTabDropAction({
        activeWorkspaceId: null,
        overWorkspaceId: "team-a",
        hasOverTarget: true,
        overIsTab: true,
      }),
    ).toBe("join-group");
    expect(
      resolveRepoTabDropAction({
        activeWorkspaceId: null,
        overWorkspaceId: "team-a",
        hasOverTarget: true,
        overIsTab: false,
      }),
    ).toBe("join-group");
  });

  it("reorders ungrouped tabs among themselves", () => {
    expect(
      resolveRepoTabDropAction({
        activeWorkspaceId: null,
        overWorkspaceId: null,
        hasOverTarget: true,
        overIsTab: true,
      }),
    ).toBe("reorder");
  });
});

describe("reorderNamedGroupIds", () => {
  it("moves a named group across peers", () => {
    expect(reorderNamedGroupIds(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("returns null when ids are invalid or unchanged", () => {
    expect(reorderNamedGroupIds(["a", "b"], "a", "a")).toBeNull();
    expect(reorderNamedGroupIds(["a", "b"], "x", "a")).toBeNull();
  });
});

describe("resolveWorkspaceGroupSortOrders", () => {
  it("reassigns the existing sortOrder pool in the new order", () => {
    expect(
      resolveWorkspaceGroupSortOrders({
        orderedWorkspaceIds: ["c", "a", "b"],
        workspaces: [
          { id: "a", sortOrder: 0 },
          { id: "b", sortOrder: 5 },
          { id: "c", sortOrder: 10 },
          { id: "hidden", sortOrder: 99 },
        ],
      }),
    ).toEqual([
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 5 },
      { id: "b", sortOrder: 10 },
    ]);
  });
});
