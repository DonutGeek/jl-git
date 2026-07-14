import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";

import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { startOpLogListener } from "@/store/useOpLogStore";
import { initAppPrefs } from "@/store/useAppPrefsStore";
import { initLocale } from "@/store/useLocaleStore";
import { initTheme } from "@/store/useThemeStore";
import "./i18n";
import "./index.css";

initTheme();
initLocale();
initAppPrefs();
void startOpLogListener();

function AppContent() {
  React.useEffect(() => {
    document.getElementById("app-loading")?.remove();
  }, []);

  return (
    <>
      <App />
      <Toaster richColors position="top-right" />
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
