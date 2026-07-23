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

  React.useEffect(() => {
    document.getElementById("app-loading")?.remove();
  }, []);

  return (
    <>
      <App />
      <Toaster
        containerAriaLabel={t("common.notifications")}
        position="top-right"
        richColors
        theme={theme}
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
