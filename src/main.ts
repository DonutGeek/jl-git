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

import "./index.css";

initTheme();
initLocale();
initAppPrefs();
disableNativeContextMenu();
void startOpLogListener();

async function bootstrap(): Promise<void> {
  const app = createApp(App);

  setupStore(app);
  setupI18n(app);
  await setupRouter(app);
  app.mount("#app");
}

void bootstrap();
