import { redactSecrets } from "@/services/ai/ai.sanitize";
import { extractPdfText } from "@/api/document";

import i18n from "@/i18n";
import { isAppError } from "@/types/error";

/** 最多附件数 */
export const MAX_BRANCH_ATTACHMENTS = 3;
/** 单文件原始大小上限（PRD PDF 常超 5MB；抽取文本仍受 MAX_ATTACHMENT_TEXT_TOTAL 约束） */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/** 全部附件抽取文本合计上限（与 staged diff 同量级） */
export const MAX_ATTACHMENT_TEXT_TOTAL = 65_536;

const ALLOWED_EXTENSIONS = new Set(["md", "markdown", "txt", "docx", "pdf"]);

export interface BranchAttachment {
  id: string;
  name: string;
  text: string;
  truncated: boolean;
}

export class BranchAttachmentError extends Error {
  readonly code: "unsupported" | "tooLarge" | "empty" | "pdfNoText" | "parseFailed";

  constructor(code: BranchAttachmentError["code"], message: string) {
    super(message);
    this.name = "BranchAttachmentError";
    this.code = code;
  }
}

/** 文件名扩展名（小写、无点）；无法识别返回 null */
export function getBranchAttachmentExtension(filename: string): string | null {
  const base = filename.trim().split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return null;
  }
  return base.slice(dot + 1).toLowerCase();
}

export function isAllowedBranchAttachmentName(filename: string): boolean {
  const ext = getBranchAttachmentExtension(filename);
  return ext !== null && ALLOWED_EXTENSIONS.has(ext);
}

/**
 * 解析单个本地文件为脱敏文本附件。
 * @param remainingTextBudget 剩余可写入文本长度预算
 */
export async function parseBranchAttachmentFile(
  file: File,
  remainingTextBudget: number = MAX_ATTACHMENT_TEXT_TOTAL,
): Promise<BranchAttachment> {
  if (!isAllowedBranchAttachmentName(file.name)) {
    throw new BranchAttachmentError(
      "unsupported",
      i18n.t("repo.aiBranchAttachmentUnsupported", { name: file.name }),
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new BranchAttachmentError(
      "tooLarge",
      i18n.t("repo.aiBranchAttachmentTooLarge", { name: file.name }),
    );
  }
  if (remainingTextBudget <= 0) {
    throw new BranchAttachmentError(
      "tooLarge",
      i18n.t("repo.aiBranchAttachmentTextBudget", { name: file.name }),
    );
  }

  const ext = getBranchAttachmentExtension(file.name);
  if (!ext) {
    throw new BranchAttachmentError(
      "unsupported",
      i18n.t("repo.aiBranchAttachmentUnsupported", { name: file.name }),
    );
  }

  const buffer = await file.arrayBuffer();
  let rawText: string;
  try {
    rawText = await extractRawText(ext, buffer);
  } catch (error) {
    if (error instanceof BranchAttachmentError) {
      throw error;
    }
    console.error("解析分支附件失败", file.name, error);
    if (isAppError(error) && error.message.trim()) {
      throw new BranchAttachmentError("parseFailed", error.message);
    }
    throw new BranchAttachmentError(
      "parseFailed",
      i18n.t("repo.aiBranchAttachmentParseFailed", { name: file.name }),
    );
  }

  const cleaned = redactSecrets(rawText)
    .replace(/\u0000/g, "")
    .trim();
  if (!cleaned) {
    throw new BranchAttachmentError(
      ext === "pdf" ? "pdfNoText" : "empty",
      ext === "pdf"
        ? i18n.t("repo.aiBranchAttachmentPdfNoText", { name: file.name })
        : i18n.t("repo.aiBranchAttachmentEmpty", { name: file.name }),
    );
  }

  const truncated = cleaned.length > remainingTextBudget;
  const text = truncated ? cleaned.slice(0, remainingTextBudget) : cleaned;

  return {
    id: crypto.randomUUID(),
    name: file.name.split(/[/\\]/).pop() ?? file.name,
    text,
    truncated,
  };
}

async function extractRawText(ext: string, buffer: ArrayBuffer): Promise<string> {
  if (ext === "md" || ext === "markdown" || ext === "txt") {
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  }
  if (ext === "docx") {
    // 动态导入，避免测试环境无谓加载原生依赖
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value ?? "";
  }
  if (ext === "pdf") {
    return extractPdfText(buffer);
  }
  throw new BranchAttachmentError(
    "unsupported",
    i18n.t("repo.aiBranchAttachmentUnsupported", { name: ext }),
  );
}
