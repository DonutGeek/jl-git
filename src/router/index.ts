import type { App } from "vue";
import { createRouter, createWebHistory } from "vue-router";

import { setupRouterGuard } from "@/router/guard";
import { routes } from "@/router/routes";

import "@/router/types";

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

setupRouterGuard(router);

export async function setupRouter(app: App): Promise<void> {
  app.use(router);
  await router.isReady();
}
