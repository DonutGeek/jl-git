import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/ui/spinner";

/** 应用与独立子窗口共用的唯一整页加载界面。 */
export function AppLoadingScreen() {
  const { t } = useTranslation();

  return (
    <main
      className="bg-background text-muted-foreground flex h-screen items-center justify-center gap-2 text-xs"
      aria-busy="true"
      aria-label={t("common.loading")}
    >
      <Spinner className="size-3.5" />
      <span>{t("common.loading")}</span>
    </main>
  );
}
