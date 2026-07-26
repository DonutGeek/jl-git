import { describe, expect, it } from "vitest";

import { buildCommitMessageExportFileName } from "./commitExportFileName";

describe("buildCommitMessageExportFileName", () => {
  it("用提交标题生成可读文件名", () => {
    expect(
      buildCommitMessageExportFileName(
        "feat(ssh): 添加本地 SSH 密钥扫描与自动登记功能",
        "2d425358",
      ),
    ).toBe("feat(ssh)-添加本地 SSH 密钥扫描与自动登记功能.txt");
  });

  it("替换路径非法字符", () => {
    expect(buildCommitMessageExportFileName("fix: path/file?", "abc1234")).toBe(
      "fix-path-file.txt",
    );
  });

  it("标题为空时回退 shortId", () => {
    expect(buildCommitMessageExportFileName("   ", "2d425358")).toBe(
      "2d425358.txt",
    );
  });
});
