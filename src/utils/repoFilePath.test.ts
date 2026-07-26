import { describe, expect, it } from "vitest";

import { toAbsoluteRepoFilePath } from "@/utils/repoFilePath";

describe("toAbsoluteRepoFilePath", () => {
  it("follows Windows repo path separators", () => {
    expect(toAbsoluteRepoFilePath("C:\\repo", "src/App.tsx", "macos")).toBe(
      "C:\\repo\\src\\App.tsx",
    );
  });

  it("follows POSIX repo path separators", () => {
    expect(toAbsoluteRepoFilePath("/Users/me/repo", "src/App.tsx", "windows")).toBe(
      "/Users/me/repo/src/App.tsx",
    );
  });

  it("uses os when repo path has no separator", () => {
    expect(toAbsoluteRepoFilePath("repo", "a/b", "windows")).toBe("repo\\a\\b");
    expect(toAbsoluteRepoFilePath("repo", "a/b", "linux")).toBe("repo/a/b");
  });
});
