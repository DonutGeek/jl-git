import { useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FolderOpen, GitBranchPlus, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { HighlightText } from "@/components/common/HighlightText";
import { LucideDynamicIcon } from "@/components/common/LucideDynamicIcon";
import { ProjectContextMenu } from "@/components/project/ProjectContextMenu";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { newTabLocationState, type NewTabProjectManagerView } from "@/utils/newTabNavigation";
import {
  filterProjectsForQuickSwitcher,
  projectQuickSwitcherValue,
  sortProjectsForQuickSwitcher,
} from "@/utils/repositoryQuickSwitcher";
import { matchesContiguousQuery } from "@/utils/textHighlight";
import { normalizeWorkspaceColor, workspaceColorTint } from "@/utils/workspaceColor";

/** cmdk 无「不选中」API；用永不匹配的受控 value 取消打开时默认高亮第一项 */
const NO_HIGHLIGHT = "__jlgit-quick-switcher-none__";

interface RepositoryQuickSwitcherProps {
  className?: string;
}

/** 活动栏仓库搜索：通过 shadcn Command 快速切换仓库或进入新标签页。 */
export function RepositoryQuickSwitcher({ className }: RepositoryQuickSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(NO_HIGHLIGHT);
  const projects = useProjectStore((state) => state.projects);
  const workspaces = useProjectStore((state) => state.workspaces);
  const currentProjectId = useProjectStore((state) => state.current?.id);
  const openNewTab = useOpenTabsStore((state) => state.openNewTab);
  const openRepositoryTab = useOpenTabsStore((state) => state.openRepositoryTab);
  const sortedProjects = useMemo(() => sortProjectsForQuickSwitcher(projects), [projects]);
  const workspaceById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace] as const)),
    [workspaces],
  );
  const workspaceNameById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name] as const)),
    [workspaces],
  );
  const filteredProjects = useMemo(
    () => filterProjectsForQuickSwitcher(sortedProjects, query, workspaceNameById),
    [query, sortedProjects, workspaceNameById],
  );
  const showNewTab = matchesContiguousQuery(t("repo.newTab"), query);
  const showOpen = matchesContiguousQuery(
    `${t("projectManager.open")} ${t("openRepo.title")}`,
    query,
  );
  const showClone = matchesContiguousQuery(`${t("projectManager.clone")} clone git`, query);
  const showFooter = showNewTab || showOpen || showClone;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: "search",
  });

  function handleNewTab(): void {
    const tabId = openNewTab();
    setOpen(false);
    setQuery("");
    navigate(`/tab/${tabId}`);
  }

  function handleNewTabView(view: NewTabProjectManagerView): void {
    const tabId = openNewTab();
    setOpen(false);
    setQuery("");
    navigate(`/tab/${tabId}`, { state: newTabLocationState(view) });
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

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            setHighlight(NO_HIGHLIGHT);
          } else {
            setQuery("");
            setHighlight(NO_HIGHLIGHT);
          }
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("repo.search")}</DialogTitle>
          <DialogDescription>{t("repo.searchRepositories")}</DialogDescription>
        </DialogHeader>
        <DialogContent
          className={cn(
            "max-w-md overflow-hidden p-0",
            // Command 默认会把 item 内 svg 拉到 h-5；业务层压回紧凑图标
            "[&_[cmdk-item]_svg]:!size-3.5",
          )}
          showCloseButton
        >
          <Command
            shouldFilter={false}
            value={highlight}
            onValueChange={setHighlight}
            className={cn(
              "**:data-[slot=command-input-wrapper]:h-12",
              "[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:font-medium",
              // 组左右留白，选中高亮不贴对话框边
              "[&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0",
              "[&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12",
              "[&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5",
            )}
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={t("repo.searchRepositories")}
              aria-label={t("repo.searchRepositories")}
            />
            {/* 关闭 CommandList 原生滚动；主滚动交给 ScrollArea（须给明确高度，仅 max-h 时 viewport 的 h-full 无法形成纵滚） */}
            <CommandList className="max-h-none overflow-hidden p-0">
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
                <CommandGroup className="p-1.5">
                  {/* 吸收 cmdk 默认选中第一项，打开时不出现可见高亮 */}
                  <CommandItem value={NO_HIGHLIGHT} className="hidden" />
                  {filteredProjects.length === 0 ? (
                    <div className="text-muted-foreground px-3 py-6 text-center text-sm">
                      {t("repo.switchProjectNoMatch")}
                    </div>
                  ) : (
                    filteredProjects.map((project) => {
                      const workspace = project.workspaceId
                        ? workspaceById.get(project.workspaceId)
                        : undefined;

                      return (
                        <ProjectContextMenu
                          key={project.id}
                          project={project}
                          onOpenProject={handleProject}
                          // 右键时清掉 cmdk 键盘/指针选中，避免两项同时 bg-accent
                          onMenuOpen={() => setHighlight(NO_HIGHLIGHT)}
                          onRemoved={() => {
                            setOpen(false);
                          }}
                        >
                          <CommandItem
                            value={projectQuickSwitcherValue(project, workspace?.name)}
                            className="min-w-0 items-start justify-start gap-2.5 overflow-hidden px-3 py-2.5"
                            aria-current={project.id === currentProjectId ? "page" : undefined}
                            onSelect={() => handleProject(project.id)}
                          >
                            <ProjectIcon
                              name={project.icon}
                              className="mt-0.5 size-3.5 shrink-0 self-start"
                            />
                            <span className="flex min-w-0 flex-1 flex-col items-stretch gap-1 overflow-hidden text-left">
                              <span className="flex min-w-0 items-center justify-start gap-1.5">
                                <HighlightText
                                  text={project.name}
                                  query={query}
                                  className="min-w-0 truncate text-left text-sm font-medium"
                                />
                                {workspace ? (
                                  <Badge
                                    variant="secondary"
                                    className="h-4 max-w-28 shrink-0 gap-1 border-transparent px-1.5 text-[10px] font-medium"
                                    style={{
                                      backgroundColor: workspaceColorTint(workspace.color),
                                      color: normalizeWorkspaceColor(workspace.color),
                                    }}
                                    title={workspace.name}
                                  >
                                    <LucideDynamicIcon
                                      name={workspace.icon}
                                      fallbackName="folder"
                                      // text-current：避开 CommandItem 的 muted svg 规则，继承徽章 color
                                      className="!size-2.5 shrink-0 text-current"
                                    />
                                    <span className="truncate">{workspace.name}</span>
                                  </Badge>
                                ) : null}
                              </span>
                              <HighlightText
                                text={project.path}
                                query={query}
                                title={project.path}
                                className="text-muted-foreground block w-full truncate text-left text-xs"
                              />
                            </span>
                          </CommandItem>
                        </ProjectContextMenu>
                      );
                    })
                  )}
                  {showFooter ? <CommandSeparator className="my-1.5" /> : null}
                  {showNewTab ? (
                    <CommandItem
                      value={t("repo.newTab")}
                      className="px-3 py-2"
                      onSelect={handleNewTab}
                    >
                      <Plus className="size-3.5 shrink-0 text-current" aria-hidden="true" />
                      <span>{t("repo.newTab")}</span>
                    </CommandItem>
                  ) : null}
                  {showOpen ? (
                    <CommandItem
                      value={`${t("projectManager.open")} ${t("openRepo.title")}`}
                      className="px-3 py-2"
                      onSelect={() => handleNewTabView("open")}
                    >
                      <FolderOpen className="size-3.5 shrink-0 text-current" aria-hidden="true" />
                      <span>{t("projectManager.open")}</span>
                    </CommandItem>
                  ) : null}
                  {showClone ? (
                    <CommandItem
                      value={`${t("projectManager.clone")} clone git`}
                      className="px-3 py-2"
                      onSelect={() => handleNewTabView("clone")}
                    >
                      <GitBranchPlus
                        className="size-3.5 shrink-0 text-current"
                        aria-hidden="true"
                      />
                      <span>{t("projectManager.clone")}</span>
                    </CommandItem>
                  ) : null}
                </CommandGroup>
              </ScrollArea>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
