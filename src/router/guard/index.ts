import { isSetupReady } from "@/utils/localServerBootstrap";

import type { Router } from "vue-router";

import { i18n } from "@/locales";

const SETUP_PATH = "/setup";

export function setupRouterGuard(router: Router): void {
  // 数据库未配通前，任何路由都强制落到向导；配通后不再允许回到向导
  router.beforeEach((to) => {
    const ready = isSetupReady();
    if (!ready && to.path !== SETUP_PATH) {
      return { path: SETUP_PATH, replace: true };
    }
    if (ready && to.path === SETUP_PATH) {
      return { path: "/", replace: true };
    }
    return true;
  });

  router.afterEach((to) => {
    const titleKey = to.meta.title;
    if (typeof titleKey === "string" && titleKey) {
      document.title = String(i18n.global.t(titleKey));
      return;
    }
    document.title = String(i18n.global.t("common.productName"));
  });
}
