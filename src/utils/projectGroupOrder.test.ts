import { describe, expect, it } from "vitest";

import { buildProjectOrderItems } from "./projectGroupOrder";

describe("buildProjectOrderItems", () => {
  it("assigns consecutive positions inside each target group", () => {
    expect(
      buildProjectOrderItems([
        { workspaceId: "frontend", projectIds: ["web", "admin"] },
        { workspaceId: null, projectIds: ["tool"] },
      ]),
    ).toEqual([
      { id: "web", workspaceId: "frontend", sortOrder: 0 },
      { id: "admin", workspaceId: "frontend", sortOrder: 1 },
      { id: "tool", workspaceId: null, sortOrder: 0 },
    ]);
  });
});
