import type { Router } from "vue-router";

import { i18n } from "@/locales";

export function setupRouterGuard(router: Router): void {
  router.afterEach((to) => {
    const titleKey = to.meta.title;
    if (typeof titleKey === "string" && titleKey) {
      document.title = String(i18n.global.t(titleKey));
      return;
    }
    document.title = String(i18n.global.t("common.productName"));
  });
}
