import type { RouteRecordRaw } from "vue-router";

import { childWindow } from "@/router/helper";

/** 项目管理子窗 */
const routes: RouteRecordRaw[] = [
  childWindow("/project-manage", "projectManage", () => import("@/views/projectManage/index.vue"), {
    title: "projectManager.manage",
    windowHeader: true,
    headerIcon: "FolderKanban",
  }),
];

export default routes;
