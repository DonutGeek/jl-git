import { FolderTree, GitBranch, Settings, Sparkles, Tag, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useSettingsDrawerStore } from "@/store/useSettingsDrawerStore";

export type SidebarView = "files" | "branches" | "tags" | "agent";

interface ActivityBarProps {
  active: SidebarView;
  onChange: (view: SidebarView) => void;
}

interface ActivityItem {
  id: SidebarView;
  icon: LucideIcon;
  labelKey: "repo.fileTree" | "repo.branches" | "repo.tags" | "agent.title";
}

const ITEMS: ActivityItem[] = [
  { id: "files", icon: FolderTree, labelKey: "repo.fileTree" },
  { id: "branches", icon: GitBranch, labelKey: "repo.branches" },
  { id: "tags", icon: Tag, labelKey: "repo.tags" },
  { id: "agent", icon: Sparkles, labelKey: "agent.title" },
];

/** 左侧活动栏：切换目录树、分支或 Agent；底部为应用设置入口 */
export function ActivityBar({ active, onChange }: ActivityBarProps) {
  const { t } = useTranslation();
  const openDrawer = useSettingsDrawerStore((state) => state.openDrawer);
  const settingsOpen = useSettingsDrawerStore((state) => state.open);

  return (
    <nav
      className="border-border bg-muted/30 flex w-11 shrink-0 flex-col items-center gap-1 border-r py-2"
      aria-label={t("repo.activityBar")}
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === active;
        const label = t(item.labelKey);

        return (
          <Tooltip key={item.id} delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-8 transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                    : "text-muted-foreground",
                )}
                aria-label={label}
                aria-pressed={isActive}
                onClick={() => onChange(item.id)}
              >
                <Icon className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}

      <div className="mt-auto flex flex-col items-center">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-8",
                settingsOpen
                  ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "text-muted-foreground",
              )}
              aria-label={t("repo.settings")}
              aria-pressed={settingsOpen}
              onClick={openDrawer}
            >
              <Settings className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {t("repo.settings")}
          </TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}
