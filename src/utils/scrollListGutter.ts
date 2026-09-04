/**
 * 面板 / 下拉长列表主滚动 gutter 约定。
 * - 内容左右对称（默认 px-2），高亮不贴边
 * - viewport 内层取消 table 布局，避免撑出横向空白
 */

/** ScrollArea：viewport 内层 block + min-w-0 */
export const SCROLL_AREA_LIST_VIEWPORT_CLASSNAME =
  "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full";

/** ScrollArea 列表常用组合 */
export const SCROLL_AREA_LIST_CLASSNAME = SCROLL_AREA_LIST_VIEWPORT_CLASSNAME;

/** 列表内容区左右对称内边距（与 HISTORY_EDGE_GAP / 分支下拉一致） */
export const SCROLL_LIST_CONTENT_PAD_CLASSNAME = "px-2 py-1";
