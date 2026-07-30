import { describe, expect, it } from "vitest";

import { joinCloneDestPath, repoNameFromCloneUrl } from "@/utils/gitClonePath";

describe("repoNameFromCloneUrl", () => {
  it("parses https and ssh urls", () => {
    expect(repoNameFromCloneUrl("https://github.com/acme/app.git")).toBe("app");
    expect(repoNameFromCloneUrl("git@github.com:acme/app.git")).toBe("app");
  });
});

describe("joinCloneDestPath", () => {
  it("joins with matching separators", () => {
    expect(joinCloneDestPath("/Users/me/code", "app")).toBe("/Users/me/code/app");
    expect(joinCloneDestPath("C:\\Users\\me", "app")).toBe("C:\\Users\\me\\app");
  });
});
