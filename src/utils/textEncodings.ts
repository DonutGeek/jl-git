/**
 * Diff 预览可选文本编码（静态清单，对齐常见桌面 Git 客户端）
 * id 传给 Rust `git_diff.encoding`；label 用于下拉展示
 */
export interface TextEncodingOption {
  id: string;
  label: string;
}

export const DEFAULT_TEXT_ENCODING = "utf-8";

/** 常见编码；不枚举全部 WHATWG 标签，避免列表过长 */
export const TEXT_ENCODING_OPTIONS: readonly TextEncodingOption[] = [
  { id: "utf-8", label: "UTF-8" },
  { id: "utf-8-bom", label: "UTF-8 with BOM" },
  { id: "gb2312", label: "GB 2312" },
  { id: "gbk", label: "GBK" },
  { id: "utf-16le", label: "UTF-16 LE" },
  { id: "utf-16le-bom", label: "UTF-16 LE BOM" },
  { id: "utf-16be", label: "UTF-16 BE" },
  { id: "utf-16be-bom", label: "UTF-16 BE BOM" },
  { id: "windows-1252", label: "Windows 1252" },
  { id: "windows-1255", label: "windows-1255" },
  { id: "big5", label: "Big5" },
  { id: "shift_jis", label: "Shift_JIS" },
  { id: "euc-kr", label: "EUC-KR" },
  { id: "iso-8859-1", label: "ISO-8859-1" },
] as const;

export function textEncodingLabel(id: string): string {
  return TEXT_ENCODING_OPTIONS.find((item) => item.id === id)?.label ?? id;
}
