import { describe, expect, it } from "vitest";

import { normalizeBranchName } from "./ai.branch";

describe("normalizeBranchName", () => {
  it("拼接前缀与 slug", () => {
    expect(normalizeBranchName("fix-login-timeout", "jlgit/")).toBe(
      "jlgit/fix-login-timeout",
    );
  });

  it("已含前缀时不去重失败", () => {
    expect(normalizeBranchName("jlgit/fix-login", "jlgit/")).toBe(
      "jlgit/fix-login",
    );
  });

  it("清洗下划线与大写", () => {
    expect(normalizeBranchName("Fix_Login_Bug", "jlgit/")).toBe(
      "jlgit/fix-login-bug",
    );
  });

  it("无前缀时仅返回 slug", () => {
    expect(normalizeBranchName("add-export", "")).toBe("add-export");
  });

  it("拒绝空或不合法输出", () => {
    expect(normalizeBranchName("", "jlgit/")).toBeNull();
    expect(normalizeBranchName("!!!", "jlgit/")).toBeNull();
  });
});
