/** 仓库工具栏密度：按容器宽度收缩（先工具，再左侧） */

export type RepoToolbarDensity = "comfortable" | "compact" | "minimal";

/**
 * 低于此宽度进入 compact：右侧四工具收进 ⋯（左侧文案仍完整）。
 * 须明显高于窗口 minWidth（900）。
 */
export const REPO_TOOLBAR_COMPACT_BELOW = 1120;

/** 低于此宽度进入 minimal：在 ⋯ 之外再缩左侧（藏视图/同步文案、窄化仓库名/分支名） */
export const REPO_TOOLBAR_MINIMAL_BELOW = 960;

/** 回升档位时的滞后，避免临界宽度来回跳 */
export const REPO_TOOLBAR_DENSITY_HYSTERESIS = 24;

/**
 * 根据工具栏宽度与上一档位解析密度。
 * 收紧优先级：先右侧工具，再左侧文案；放宽需超过阈值 + hysteresis。
 */
export function resolveRepoToolbarDensity(
  width: number,
  previous: RepoToolbarDensity,
): RepoToolbarDensity {
  if (!Number.isFinite(width) || width <= 0) {
    return previous;
  }

  const expandCompact = REPO_TOOLBAR_COMPACT_BELOW + REPO_TOOLBAR_DENSITY_HYSTERESIS;
  const expandMinimal = REPO_TOOLBAR_MINIMAL_BELOW + REPO_TOOLBAR_DENSITY_HYSTERESIS;

  switch (previous) {
    case "comfortable":
      if (width < REPO_TOOLBAR_MINIMAL_BELOW) {
        return "minimal";
      }
      if (width < REPO_TOOLBAR_COMPACT_BELOW) {
        return "compact";
      }
      return "comfortable";
    case "compact":
      if (width < REPO_TOOLBAR_MINIMAL_BELOW) {
        return "minimal";
      }
      if (width >= expandCompact) {
        return "comfortable";
      }
      return "compact";
    case "minimal":
      if (width >= expandCompact) {
        return "comfortable";
      }
      if (width >= expandMinimal) {
        return "compact";
      }
      return "minimal";
  }
}
