import { describe, expect, it } from "vitest";

import {
  DEFAULT_BRANCH_PREFIX,
  isBranchPrefixInputValid,
  normalizeBranchPrefix,
} from "./branchPrefix";

describe("normalizeBranchPrefix", () => {
  it("空串保持为空", () => {
    expect(normalizeBranchPrefix("")).toBe("");
    expect(normalizeBranchPrefix("   ")).toBe("");
  });

  it("补齐尾部斜杠", () => {
    expect(normalizeBranchPrefix("jlgit")).toBe("jlgit/");
    expect(normalizeBranchPrefix("jingyue/")).toBe("jingyue/");
  });

  it("默认常量带斜杠", () => {
    expect(DEFAULT_BRANCH_PREFIX).toBe("jlgit/");
  });
});

describe("isBranchPrefixInputValid", () => {
  it("拒绝含空白或反斜杠", () => {
    expect(isBranchPrefixInputValid("foo bar")).toBe(false);
    expect(isBranchPrefixInputValid("foo\\bar")).toBe(false);
  });

  it("接受空与合法前缀", () => {
    expect(isBranchPrefixInputValid("")).toBe(true);
    expect(isBranchPrefixInputValid("jlgit/")).toBe(true);
  });
});
