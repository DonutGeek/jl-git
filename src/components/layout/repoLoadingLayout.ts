export const REPO_CHANGES_LOADING_AREAS = ["sidebar", "unstaged", "staged", "preview"] as const;
export const REPO_MAIN_LOADING_AREA = "main";
export const REPO_LOADING_LABEL_KEY = "common.loading";

export const REPO_TAB_SCROLL_AREA_CLASSNAME =
  // 横向滚动条叠在底边；外层容器另留 pb-px 给分隔线，避免分组壳压线
  // Viewport 内层覆盖为 block：抵消 Radix 默认 table 导致的高度异常
  "h-full w-full min-w-0 [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!h-full [&_[data-slot=scroll-area-viewport]>div]:!w-max [&_[data-slot=scroll-area-viewport]>div]:!min-w-full [&>[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:hidden [&>[data-slot=scroll-area-scrollbar][data-orientation=horizontal]]:h-1.5";
// 左侧间隔由打开按钮 mr-2 承担（在滚动区外，始终可见）；pr-1.5：末组不被裁切
export const REPO_TAB_CONTENT_CLASSNAME = "flex h-full w-max items-center gap-1.5 pr-1.5";

/** 与标签条左右渐隐层宽度一致（w-10） */
export const REPO_TAB_SCROLL_FADE_PX = 40;

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

/**
 * 在横向 ScrollArea viewport 内滚入元素，并预留左右渐隐宽度，
 * 避免选中标签停在半透明遮罩下（不用 scrollIntoView，以免滚错祖先）。
 */
export function scrollHorizontallyIntoView(
  viewport: HTMLElement,
  element: HTMLElement,
  edgePadding: number = REPO_TAB_SCROLL_FADE_PX,
  behavior: ScrollBehavior = "smooth",
): void {
  const viewportRect = viewport.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  let delta = 0;

  if (elementRect.left < viewportRect.left + edgePadding) {
    delta = elementRect.left - (viewportRect.left + edgePadding);
  } else if (elementRect.right > viewportRect.right - edgePadding) {
    delta = elementRect.right - (viewportRect.right - edgePadding);
  }

  if (delta === 0) {
    return;
  }

  viewport.scrollBy({ left: delta, behavior });
}
