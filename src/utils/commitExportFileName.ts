/**
 * 由提交标题生成另存为默认文件名（不含目录）。
 * 去掉系统非法字符，过长截断；标题为空时回退 shortId。
 */
export function buildCommitMessageExportFileName(
  subject: string,
  shortId: string,
): string {
  const cleaned = subject
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .trim()
    .replace(/[-.]+$/g, "");

  const base = (cleaned.slice(0, 100) || shortId.trim() || "commit").trim();
  return `${base}.txt`;
}
