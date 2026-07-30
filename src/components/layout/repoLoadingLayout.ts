export const REPO_CHANGES_LOADING_AREAS = ["sidebar", "unstaged", "staged", "preview"] as const;
export const REPO_MAIN_LOADING_AREA = "main";
export const REPO_LOADING_LABEL_KEY = "common.loading";

export const REPO_TAB_SCROLL_AREA_CLASSNAME =
  "h-full w-full min-w-0 [&_[data-slot=scroll-area-viewport]]:pb-2.5 [&>[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:hidden";
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
