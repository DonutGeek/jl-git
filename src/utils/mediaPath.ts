const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "avif",
]);

/** 按扩展名判断是否走图片预览（与 Rust mime_from_path 对齐） */
export function isImagePath(filePath: string): boolean {
  const base = filePath.split(/[/\\]/).pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(base.slice(dot + 1).toLowerCase());
}
