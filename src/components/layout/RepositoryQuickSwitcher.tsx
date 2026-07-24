import { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ProjectIcon } from "@/components/project/ProjectIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";
import {
  projectQuickSwitcherValue,
  sortProjectsForQuickSwitcher,
} from "@/utils/repositoryQuickSwitcher";
import { cn } from "@/lib/utils";

interface RepositoryQuickSwitcherProps {
  className?: string;
}

/** 活动栏仓库搜索：通过 shadcn Command 快速切换仓库或进入新标签页。 */
export function RepositoryQuickSwitcher({
  className,
}: RepositoryQuickSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const projects = useProjectStore((state) => state.projects);
  const workspaces = useProjectStore((state) => state.workspaces);
  const currentProjectId = useProjectStore((state) => state.current?.id);
  const openNewTab = useOpenTabsStore((state) => state.openNewTab);
  const openRepositoryTab = useOpenTabsStore(
    (state) => state.openRepositoryTab,
  );
  const sortedProjects = useMemo(
    () => sortProjectsForQuickSwitcher(projects),
    [projects],
  );
  const workspaceNames = useMemo(
    () =>
      new Map(
        workspaces.map((workspace) => [workspace.id, workspace.name] as const),
      ),
    [workspaces],
  );
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: "search" });

  function handleNewTab(): void {
    const tabId = openNewTab();
    setOpen(false);
    navigate(`/tab/${tabId}`);
  }

  function handleProject(projectId: string): void {
    if (projectId === currentProjectId) {
      setOpen(false);
      return;
    }

    openRepositoryTab(projectId);
    setOpen(false);
    navigate(`/repo/${projectId}`);
  }

  return (
    <>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-8 touch-none transition-colors",
              isDragging ? "cursor-grabbing opacity-50" : "cursor-pointer",
              open
                ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                : "text-muted-foreground",
              className,
            )}
            style={{
              transform: CSS.Transform.toString(transform),
              transition,
            }}
            aria-label={t("repo.search")}
            aria-expanded={open}
            onClick={() => {
              if (!isDragging) {
                setOpen(true);
              }
            }}
          >
            <Search className="size-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {t("repo.search")}
        </TooltipContent>
      </Tooltip>

      {open ? (
        <CommandDialog
          open
          onOpenChange={setOpen}
          title={t("repo.search")}
          description={t("repo.searchRepositories")}
          className="max-w-md"
        >
          <CommandInput
            placeholder={t("repo.searchRepositories")}
            aria-label={t("repo.searchRepositories")}
          />
          {/* 关闭 CommandList 原生滚动；主滚动交给 ScrollArea（须给明确高度，仅 max-h 时 viewport 的 h-full 无法形成纵滚） */}
          <CommandList className="max-h-none overflow-hidden p-0">
            <CommandEmpty>{t("repo.switchProjectNoMatch")}</CommandEmpty>
            <ScrollArea
              className={cn(
                "h-80",
                // Radix viewport 内层 display:table 会被长路径撑宽 → 横滚 + truncate 失效
                "[&_[data-slot=scroll-area-viewport]]:overflow-x-hidden",
                "[&_[data-slot=scroll-area-viewport]>div]:!block",
                "[&_[data-slot=scroll-area-viewport]>div]:!min-w-0",
                "[&_[data-slot=scroll-area-viewport]>div]:w-full",
                "[&_[data-slot=scroll-area-scrollbar][data-orientation=horizontal]]:hidden",
              )}
            >
              <CommandGroup className="py-2">
                {sortedProjects.map((project) => {
                  const workspaceName = project.workspaceId
                    ? workspaceNames.get(project.workspaceId)
                    : undefined;

                  return (
                    <CommandItem
                      key={project.id}
                      value={projectQuickSwitcherValue(project, workspaceName)}
                      className="min-w-0 overflow-hidden"
                      aria-current={
                        project.id === currentProjectId ? "page" : undefined
                      }
                      onSelect={() => handleProject(project.id)}
                    >
                      <ProjectIcon name={project.icon} className="shrink-0" />
                      <span className="min-w-0 max-w-[40%] shrink truncate font-medium">
                        {project.name}
                      </span>
                      {workspaceName ? (
                        <Badge
                          variant="secondary"
                          className="h-4 max-w-28 shrink-0 px-1.5 text-[10px]"
                          title={workspaceName}
                        >
                          <span className="truncate">{workspaceName}</span>
                        </Badge>
                      ) : null}
                      <span
                        className="text-muted-foreground min-w-0 flex-1 truncate text-xs"
                        title={project.path}
                      >
                        {project.path}
                      </span>
                    </CommandItem>
                  );
                })}
                <CommandItem value={t("repo.newTab")} onSelect={handleNewTab}>
                  <Plus aria-hidden="true" />
                  <span>{t("repo.newTab")}</span>
                </CommandItem>
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </CommandDialog>
      ) : null}
    </>
  );
}
