import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LayoutGrid, List } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type BrowserViewMode = "grid" | "list";

interface WorkspaceBrowserChromeProps {
  pathContent: ReactNode;
  viewMode: BrowserViewMode;
  onViewModeChange: (viewMode: BrowserViewMode) => void;
  children: ReactNode;
}

/** 工作区浏览器的纯展示外壳：路径栏、视图切换和内容区。 */
export function WorkspaceBrowserChrome({
  pathContent,
  viewMode,
  onViewModeChange,
  children,
}: WorkspaceBrowserChromeProps) {
  const { t } = useTranslation();

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-repo-shell="workspace-browser"
    >
      <header className="border-border flex h-10 shrink-0 items-center gap-2 border-b px-3">
        {pathContent}

        <div
          className="flex h-8 shrink-0 items-center gap-0.5"
          role="group"
          aria-label={t("repo.workspaceViewMode")}
        >
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-7 transition-colors",
                  viewMode === "grid"
                    ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                    : "text-muted-foreground",
                )}
                aria-pressed={viewMode === "grid"}
                aria-label={t("repo.viewGrid")}
                onClick={() => onViewModeChange("grid")}
              >
                <LayoutGrid className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("repo.viewGrid")}</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-7 transition-colors",
                  viewMode === "list"
                    ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                    : "text-muted-foreground",
                )}
                aria-pressed={viewMode === "list"}
                aria-label={t("repo.viewList")}
                onClick={() => onViewModeChange("list")}
              >
                <List className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("repo.viewList")}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {children}
    </section>
  );
}
