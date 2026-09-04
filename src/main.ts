import { createApp } from "vue";

import "antdv-next/dist/reset.css";

import App from "@/App.vue";
import { setupI18n } from "@/locales";
import { setupRouter } from "@/router";
import { setupStore } from "@/store";
import { initAppPrefs } from "@/store/modules/app";
import { initLocale } from "@/store/modules/locale";
import { startOpLogListener } from "@/store/modules/opLog";
import { initTheme } from "@/store/modules/theme";
import { disableNativeContextMenu } from "@/utils/disableNativeContextMenu";
import { bootstrapLocalServer } from "@/utils/localServerBootstrap";

import "./index.css";

initTheme();
initLocale();
initAppPrefs();
disableNativeContextMenu();
void startOpLogListener();

async function bootstrap(): Promise<void> {
  // 先接通本地服务并探明数据库就绪状态，路由守卫才能正确决定首屏
  await bootstrapLocalServer();

  const app = createApp(App);

  setupStore(app);
  setupI18n(app);
  await setupRouter(app);
  app.mount("#app");
}

void bootstrap();
