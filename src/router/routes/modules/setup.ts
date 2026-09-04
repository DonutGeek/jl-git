import { childWindow } from "@/router/helper";

import type { RouteRecordRaw } from "vue-router";

/**
 * 首启配置向导：沉浸式满屏。
 * PAGE_LAYOUT 只在 `meta.windowHeader === true` 时渲染标题栏，
 * 这里不设即为无标题栏、无标签栏的整屏壳。
 */
const SetupWizard = () => import("@/views/setup/index.vue");

const routes: RouteRecordRaw[] = [
  childWindow("/setup", "setup", SetupWizard, { title: "setup.title" }),
];

export default routes;
