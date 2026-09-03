/** 主窗壳（标签栏 + 工作区） */
export const DEFAULT_LAYOUT = () => import("@/layouts/default/index.vue");

/** 子窗壳（项目管理等独立 WebView） */
export const PAGE_LAYOUT = () => import("@/layouts/page/index.vue");

/** 对齐 vben：`meta.frameSrc` 时内嵌页面 */
export const FRAME_LAYOUT = () => import("@/layouts/iframe/index.vue");
