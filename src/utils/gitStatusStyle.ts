/**
 * Git 状态字母着色 — 全应用统一（目录树 / 变更列表 / 提交详情）
 * 颜色来自 Design Tokens：--git-*
 *
 * 着色请传**原始** porcelain 字（`?` / `U` / `A`…），不要先 normalize：
 * - `?` / `!` → 未跟踪（展示字母多为 U）
 * - porcelain `U` → 冲突未合并
 * - AA/DD 等请额外传 `conflict: true`
 */

export type GitStatusColorToken =
  "added" | "untracked" | "deleted" | "renamed" | "modified" | "conflict";

/** 将 porcelain 状态字规范为展示字母 */
export function normalizeGitStatusLetter(status: string): string {
  if (status === "?" || status === "!") {
    return "U";
  }
  return status;
}

export interface GitStatusColorOptions {
  /** 冲突条目（含 AA/DD 等两侧同为 A/D）强制用冲突色 */
  conflict?: boolean;
}

/** 根据原始 porcelain 状态字解析着色 token */
export function resolveGitStatusColorToken(
  status: string,
  options?: GitStatusColorOptions,
): GitStatusColorToken {
  if (options?.conflict) {
    return "conflict";
  }
  if (status === "?" || status === "!") {
    return "untracked";
  }

  const letter = status.toUpperCase();
  switch (letter) {
    case "A":
      return "added";
    case "U":
      // porcelain U = unmerged；展示用的 U（由 ? normalize 而来）不应走到这里
      return "conflict";
    case "D":
      return "deleted";
    case "R":
    case "C":
      return "renamed";
    case "M":
    case "T":
    case "E":
      return "modified";
    default:
      return "modified";
  }
}

/** Tailwind 文字色（依赖 theme-map 中的 --color-git-*） */
export function gitStatusLetterClass(status: string, options?: GitStatusColorOptions): string {
  const token = resolveGitStatusColorToken(status, options);
  if (token === "added") return "text-git-added";
  if (token === "untracked") return "text-git-untracked";
  if (token === "deleted") return "text-git-deleted";
  if (token === "renamed") return "text-git-renamed";
  if (token === "conflict") return "text-git-conflict";
  return "text-git-modified";
}

/** 图片预览等边框色，与状态字母同色 */
export function gitStatusBorderClass(status: string, options?: GitStatusColorOptions): string {
  const token = resolveGitStatusColorToken(status, options);
  if (token === "added") return "border-git-added";
  if (token === "untracked") return "border-git-untracked";
  if (token === "deleted") return "border-git-deleted";
  if (token === "renamed") return "border-git-renamed";
  if (token === "conflict") return "border-git-conflict";
  return "border-git-modified";
}
