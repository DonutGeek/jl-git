import { describe, expect, it } from "vitest";

import { groupRepoTabs, resolveRepoTabDropAction } from "@/utils/repoTabGroups";

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

  it("does not move an ungrouped tab into a workspace", () => {
    expect(
      resolveRepoTabDropAction({
        activeWorkspaceId: null,
        overWorkspaceId: "team-a",
        hasOverTarget: true,
        overIsTab: true,
      }),
    ).toBe("none");
  });
});
