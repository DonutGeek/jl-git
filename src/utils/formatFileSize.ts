/** 将字节数格式化为简短可读大小（如 `2 KB`） */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return kb < 10 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
  }

  const mb = kb / 1024;
  if (mb < 1024) {
    return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
  }

  const gb = mb / 1024;
  return gb < 10 ? `${gb.toFixed(1)} GB` : `${Math.round(gb)} GB`;
}
