import type { RouteRecordRaw } from "vue-router";

import { mergeRouteModules } from "@/router/helper";

import { PAGE_NOT_FOUND_ROUTE } from "./basic";

const moduleFiles = import.meta.glob<{ default: RouteRecordRaw | RouteRecordRaw[] }>(
  "./modules/**/*.ts",
  { eager: true },
);

/** 业务路由（`routes/modules`）+ 404 兜底，对齐 vben 2 */
export const routes: RouteRecordRaw[] = [...mergeRouteModules(moduleFiles), PAGE_NOT_FOUND_ROUTE];
