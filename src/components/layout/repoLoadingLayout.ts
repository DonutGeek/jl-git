export const REPO_CHANGES_LOADING_AREAS = ["sidebar", "unstaged", "staged", "preview"] as const;
export const REPO_MAIN_LOADING_AREA = "main";
export const REPO_LOADING_LABEL_KEY = "common.loading";

export const REPO_TAB_SCROLL_AREA_CLASSNAME =
  // 横向滚动条叠在底边空隙，不预留 pb，避免分组视觉上偏上
  // Viewport 内层覆盖为 block：抵消 Radix 默认 table 导致的高度异常
  "h-full w-full min-w-0 [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!h-full [&_[data-slot=scroll-area-viewport]>div]:!w-max [&_[data-slot=scroll-area-viewport]>div]:!min-w-full [&>[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:hidden [&>[data-slot=scroll-area-scrollbar][data-orientation=horizontal]]:h-1.5";
export const REPO_TAB_CONTENT_CLASSNAME = "flex h-full w-max items-center gap-1.5 pr-1.5";

interface RepoTabWheelInput {
  deltaX: number;
  deltaY: number;
  hasOverflow: boolean;
}

export function resolveRepoTabWheelDelta({
  deltaX,
  deltaY,
  hasOverflow,
}: RepoTabWheelInput): number {
  if (!hasOverflow || Math.abs(deltaX) >= Math.abs(deltaY)) {
    return 0;
  }
  return deltaY;
}
