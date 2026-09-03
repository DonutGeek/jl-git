import type { RouteRecordRaw } from "vue-router";

/** 未匹配路径兜底；必须放在路由表最后 */
export const PAGE_NOT_FOUND_ROUTE: RouteRecordRaw = {
  path: "/:pathMatch(.*)*",
  name: "notFound",
  component: () => import("@/views/migrationPlaceholder/index.vue"),
  meta: { title: "common.migrationTitle" },
};
