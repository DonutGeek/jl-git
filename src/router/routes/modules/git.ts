import type { RouteRecordRaw } from "vue-router";

import { childWindow } from "@/router/helper";

/** 仓库类子窗：分支比较 / 管理 / 历史、提交与文件历史 */
const routes: RouteRecordRaw[] = [
  childWindow("/branch-compare", "branchCompare", () => import("@/views/branchCompare/index.vue"), {
    title: "branchCompare.title",
  }),
  childWindow("/file-history", "fileHistory", () => import("@/views/fileHistory/index.vue"), {
    title: "fileHistory.windowTitle",
  }),
  childWindow("/commit-history", "commitHistory", () => import("@/views/commitHistory/index.vue"), {
    title: "commitHistory.windowTitle",
  }),
  childWindow("/branch-history", "branchHistory", () => import("@/views/branchHistory/index.vue"), {
    title: "branchHistory.windowTitleAll",
  }),
  childWindow("/branch-manage", "branchManage", () => import("@/views/branchManage/index.vue"), {
    title: "branchManage.windowTitle",
  }),
];

export default routes;
