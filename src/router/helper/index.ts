import type { RouteRecordRaw } from "vue-router";

import { FRAME_LAYOUT, PAGE_LAYOUT } from "@/router/constant";

/** 把 glob 出来的路由模块拍平，对齐 vben `mergeRouteModules` */
export function mergeRouteModules(
  glob: Record<string, { default?: RouteRecordRaw | RouteRecordRaw[] }>,
): RouteRecordRaw[] {
  return Object.values(glob).flatMap((mod) => {
    const exported = mod.default;
    if (!exported) {
      return [];
    }
    return Array.isArray(exported) ? exported : [exported];
  });
}

/**
 * 子窗路由：外层挂 PageLayout / FrameLayout，内层才是业务页。
 * 有 `meta.frameSrc` 时走 iframe 布局。
 */
export function childWindow(
  path: string,
  name: string,
  component: RouteRecordRaw["component"],
  meta: RouteRecordRaw["meta"],
): RouteRecordRaw {
  return {
    path,
    component: meta?.frameSrc ? FRAME_LAYOUT : PAGE_LAYOUT,
    children: [
      {
        path: "",
        name,
        component: component as NonNullable<RouteRecordRaw["component"]>,
        meta,
      },
    ],
  };
}
