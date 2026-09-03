import type { RouteRecordRaw } from "vue-router";

import { childWindow } from "@/router/helper";

const MultiAgentPage = () => import("@/views/agent/index.vue");

/** 多仓鲸灵子窗；`/jinglv` `/resume-helper` 为兼容入口 */
const routes: RouteRecordRaw[] = [
  childWindow("/agent", "multiAgent", MultiAgentPage, {
    title: "multiAgent.windowTitle",
  }),
  childWindow("/jinglv", "jinglvCompat", MultiAgentPage, {
    title: "multiAgent.windowTitle",
  }),
  childWindow("/resume-helper", "resumeHelper", MultiAgentPage, {
    title: "multiAgent.windowTitle",
  }),
];

export default routes;
