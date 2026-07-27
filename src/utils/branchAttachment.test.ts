import { describe, expect, it } from "vitest";

import {
  MAX_ATTACHMENT_BYTES,
  getBranchAttachmentExtension,
  isAllowedBranchAttachmentName,
  parseBranchAttachmentFile,
} from "./branchAttachment";

describe("getBranchAttachmentExtension / isAllowedBranchAttachmentName", () => {
  it("识别允许的扩展名", () => {
    expect(getBranchAttachmentExtension("prd.md")).toBe("md");
    expect(getBranchAttachmentExtension("a.MARKDOWN")).toBe("markdown");
    expect(isAllowedBranchAttachmentName("spec.docx")).toBe(true);
    expect(isAllowedBranchAttachmentName("notes.txt")).toBe(true);
    expect(isAllowedBranchAttachmentName("doc.pdf")).toBe(true);
  });

  it("拒绝非法扩展名", () => {
    expect(isAllowedBranchAttachmentName("a.doc")).toBe(false);
    expect(isAllowedBranchAttachmentName("a.png")).toBe(false);
    expect(isAllowedBranchAttachmentName("noext")).toBe(false);
  });
});

describe("parseBranchAttachmentFile", () => {
  it("解析纯文本并脱敏", async () => {
    const file = new File(
      ["需求：修复登录\napi_key=sk-abcdefghijklmnopqrstuvwxyz"],
      "prd.txt",
      { type: "text/plain" },
    );
    const attachment = await parseBranchAttachmentFile(file);
    expect(attachment.name).toBe("prd.txt");
    expect(attachment.text).toContain("修复登录");
    expect(attachment.text).toContain("[REDACTED]");
    expect(attachment.text).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(attachment.truncated).toBe(false);
  });

  it("拒绝超大文件", async () => {
    const file = new File(
      [new Uint8Array(MAX_ATTACHMENT_BYTES + 1)],
      "big.txt",
    );
    await expect(parseBranchAttachmentFile(file)).rejects.toMatchObject({
      code: "tooLarge",
    });
  });

  it("拒绝空文本", async () => {
    const file = new File(["   \n  "], "empty.md", { type: "text/markdown" });
    await expect(parseBranchAttachmentFile(file)).rejects.toMatchObject({
      code: "empty",
    });
  });

  it("按预算截断", async () => {
    const file = new File(["abcdefghij"], "short.txt", { type: "text/plain" });
    const attachment = await parseBranchAttachmentFile(file, 4);
    expect(attachment.text).toBe("abcd");
    expect(attachment.truncated).toBe(true);
  });
});
