import React from "react";
import ReactDOM from "react-dom/client";
import { useTranslation } from "react-i18next";

import App from "./App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { startOpLogListener } from "@/store/useOpLogStore";
import { initAppPrefs } from "@/store/useAppPrefsStore";
import { initLocale } from "@/store/useLocaleStore";
import { initTheme, useThemeStore } from "@/store/useThemeStore";
import "./i18n";
import "./index.css";

initTheme();
initLocale();
initAppPrefs();
void startOpLogListener();

function AppContent() {
  const { t } = useTranslation();
  const theme = useThemeStore((state) => state.mode);

  return (
    <>
      <App />
      <Toaster
        containerAriaLabel={t("common.notifications")}
        position="top-center"
        richColors
        theme={theme}
        // 成功提示尽量短；错误仍用默认时长便于阅读
        duration={2500}
        // 避开 macOS 标题栏 / 顶栏标签，略向下偏移
        offset={{ top: 48 }}
      />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={300}>
      <AppContent />
    </TooltipProvider>
  </React.StrictMode>,
);
