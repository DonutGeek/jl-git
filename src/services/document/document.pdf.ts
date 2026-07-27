import { join, tempDir } from "@tauri-apps/api/path";
import { remove, writeFile } from "@tauri-apps/plugin-fs";

import { invokeCommand } from "@/services/invoke";

/**
 * 通过 Rust 抽取 PDF 可选中文字（无 OCR）。
 * 写入系统临时文件后解析，避免大文件 Base64 堵死前端主线程。
 */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const fileName = `jlgit-pdf-${crypto.randomUUID()}.pdf`;
  const path = await join(await tempDir(), fileName);
  try {
    await writeFile(path, new Uint8Array(data));
    const result = await invokeCommand<{ text: string }>("document_extract_pdf_text", {
      input: { path },
    });
    return result.text ?? "";
  } finally {
    await remove(path).catch(() => undefined);
  }
}
