import { describe, expect, it } from "vitest";

import {
  joinCloneDestPath,
  repoNameFromCloneUrl,
  suggestCloneDestPath,
} from "@/utils/gitClonePath";

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

describe("suggestCloneDestPath", () => {
  it("fills empty path from repo name", () => {
    expect(
      suggestCloneDestPath({
        url: "https://github.com/acme/app.git",
        currentPath: "",
        previousRepoName: "",
        parentHint: "/Users/me",
      }),
    ).toEqual({ path: "/Users/me/app", repoName: "app" });
  });

  it("replaces previous trailing repo name", () => {
    expect(
      suggestCloneDestPath({
        url: "https://github.com/acme/other.git",
        currentPath: "/Users/me/app",
        previousRepoName: "app",
      }),
    ).toEqual({ path: "/Users/me/other", repoName: "other" });
  });
});
