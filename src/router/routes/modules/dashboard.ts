import type { RouteRecordRaw } from "vue-router";

import { DEFAULT_LAYOUT } from "@/router/constant";

/**
 * 主窗：真实页面由 WorkspaceHost 按 path 保活。
 * 这里的 component 只给 RouterView 做匹配，避免子路由 404。
 */
const MigrationPlaceholder = () => import("@/views/migrationPlaceholder/index.vue");

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: DEFAULT_LAYOUT,
    children: [
      {
        path: "",
        name: "dashboard",
        component: MigrationPlaceholder,
        meta: { title: "common.productName" },
      },
      {
        path: "tab/:tabId",
        name: "tab",
        component: MigrationPlaceholder,
        meta: { title: "common.productName" },
      },
      {
        path: "repo/:projectId",
        name: "repo",
        component: MigrationPlaceholder,
        meta: { title: "common.productName" },
      },
    ],
  },
];

export default routes;
