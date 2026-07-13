/**
 * Git 状态字母着色 — 全应用统一（目录树 / 变更列表 / 提交详情）
 * 颜色来自 Design Tokens：--git-*
 */

/** 将 porcelain 状态字规范为展示字母 */
export function normalizeGitStatusLetter(status: string): string {
  if (status === "?" || status === "!") {
    return "U";
  }
  return status;
}

/** Tailwind 语义色 class（依赖 theme-map 中的 --color-git-*） */
export function gitStatusLetterClass(status: string): string {
  const letter = normalizeGitStatusLetter(status).toUpperCase();

  switch (letter) {
    case "A":
      return "text-git-added";
    case "U":
      return "text-git-untracked";
    case "D":
      return "text-git-deleted";
    case "R":
    case "C":
      return "text-git-renamed";
    case "M":
    case "T":
    case "E":
      return "text-git-modified";
    default:
      // 其它少见状态按修改处理，保持可见色
      return "text-git-modified";
  }
}
