import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FolderTree, GitBranch, Settings, Sparkles, Tag, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { RepositoryQuickSwitcher } from "@/components/layout/RepositoryQuickSwitcher";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import { useAppPrefsStore } from "@/store/useAppPrefsStore";
import { useSettingsDrawerStore } from "@/store/useSettingsDrawerStore";
import { cn } from "@/lib/utils";
import {
  moveActivityBarItem,
  type ActivityBarItemId,
  type SidebarView,
} from "@/utils/activityBarOrder";

export type { SidebarView } from "@/utils/activityBarOrder";

interface ActivityBarProps {
  active: SidebarView;
  onChange: (view: SidebarView) => void;
}

interface ActivityItem {
  id: SidebarView;
  icon: LucideIcon;
  labelKey: "repo.fileTree" | "repo.branches" | "repo.tags" | "agent.title";
}

const ITEMS: Record<SidebarView, ActivityItem> = {
  files: { id: "files", icon: FolderTree, labelKey: "repo.fileTree" },
  branches: { id: "branches", icon: GitBranch, labelKey: "repo.branches" },
  tags: { id: "tags", icon: Tag, labelKey: "repo.tags" },
  agent: { id: "agent", icon: Sparkles, labelKey: "agent.title" },
};

interface SortableActivityItemProps {
  item: ActivityItem;
  active: SidebarView;
  agentLocked: boolean;
  tip: string;
  onChange: (view: SidebarView) => void;
}

function SortableActivityItem({
  item,
  active,
  agentLocked,
  tip,
  onChange,
}: SortableActivityItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  const Icon = item.icon;
  const isActive = item.id === active;

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <span
          ref={setNodeRef}
          className={cn(
            "inline-flex",
            isDragging && "relative z-10 opacity-50",
          )}
          style={{ transform: CSS.Transform.toString(transform), transition }}
        >
          <Button
            {...attributes}
            {...listeners}
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-8 touch-none transition-colors",
              isDragging ? "cursor-grabbing" : "cursor-pointer",
              isActive
                ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                : "text-muted-foreground",
            )}
            aria-label={tip}
            aria-pressed={isActive}
            disabled={agentLocked}
            onClick={() => {
              if (!isDragging) {
                onChange(item.id);
              }
            }}
          >
            <Icon className="size-4" aria-hidden="true" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

/** 左侧活动栏：切换目录树、分支或 Agent；底部为应用设置入口 */
export function ActivityBar({ active, onChange }: ActivityBarProps) {
  const { t } = useTranslation();
  const openDrawer = useSettingsDrawerStore((state) => state.openDrawer);
  const settingsOpen = useSettingsDrawerStore((state) => state.open);
  const hasApiKey = useHasAgentApiKey();
  const activityBarOrder = useAppPrefsStore(
    (state) => state.activityBarOrder,
  );
  const setActivityBarOrder = useAppPrefsStore(
    (state) => state.setActivityBarOrder,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent): void {
    if (!event.over) {
      return;
    }
    setActivityBarOrder(
      moveActivityBarItem(
        activityBarOrder,
        String(event.active.id),
        String(event.over.id),
      ),
    );
  }

  return (
    <nav
      data-jlgit-activity-bar=""
      className="border-border bg-muted/30 flex w-11 shrink-0 flex-col items-center gap-1 border-r py-2"
      aria-label={t("repo.activityBar")}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={activityBarOrder}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col items-center gap-1">
            {activityBarOrder.map((id: ActivityBarItemId) => {
              if (id === "search") {
                return <RepositoryQuickSwitcher key={id} />;
              }

              const item = ITEMS[id];
              const label = t(item.labelKey);
              const agentLocked = item.id === "agent" && !hasApiKey;
              const tip = agentLocked
                ? t("common.aiApiKeyRequired")
                : label;

              return (
                <SortableActivityItem
                  key={item.id}
                  item={item}
                  active={active}
                  agentLocked={agentLocked}
                  tip={tip}
                  onChange={onChange}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

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
              onClick={() => openDrawer()}
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
