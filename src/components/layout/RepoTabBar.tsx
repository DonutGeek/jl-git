import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FolderPlus, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { OpenRepoDialog } from "@/components/project/OpenRepoDialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useOpenTabsStore, type OpenTab } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";

import { gitService } from "@/services/git";
import { pickPrimaryRemoteUrl } from "@/services/git/git.remote";
import { copyToClipboard } from "@/utils/clipboard";

import { toUserMessage } from "@/types/error";
import { Project } from "@/types/project";

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

function resolveActiveTabId(pathname: string, tabs: OpenTab[]): string | null {
  const repositoryMatch = pathname.match(/^\/repo\/([^/]+)/);
  if (repositoryMatch) {
    return repositoryMatch[1] ?? null;
  }
  const newTabMatch = pathname.match(/^\/tab\/([^/]+)/);
  if (newTabMatch?.[1]) {
    return newTabMatch[1];
  }
  // 根路径也在展示新标签页内容时，高亮已有「新标签页」
  if (pathname === "/") {
    return tabs.find((tab) => tab.type === "new-tab")?.id ?? null;
  }
  return null;
}

interface TabDisplayItem {
  id: string;
  label: string;
  title: string;
  type: OpenTab["type"];
  project?: Project;
}

interface TabChromeProps {
  tab: TabDisplayItem;
  isActive: boolean;
  dragging?: boolean;
  onSelect?: (tabId: string) => void;
  onClose?: (event: MouseEvent | KeyboardEvent, tabId: string) => void;
  closeLabel?: string;
}

function TabChrome({ tab, isActive, dragging = false, onSelect, onClose, closeLabel }: TabChromeProps) {
  return (
    <div
      className={cn(
        "group relative flex h-7 max-w-[180px] items-center rounded-md font-mono text-xs leading-none transition-colors",
        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/60",
        dragging && "bg-primary/10 text-primary ring-1 ring-border",
      )}
    >
      {/* 整块标签（含内边距）可点，不只文字 */}
      <button
        type="button"
        className={cn(
          "flex h-full min-w-0 flex-1 items-center truncate py-0 pr-0.5 pl-2.5 text-left leading-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onClick={() => onSelect?.(tab.id)}
        title={tab.title}
        aria-current={isActive ? "page" : undefined}
        tabIndex={dragging ? -1 : undefined}
      >
        {tab.label}
      </button>
      {closeLabel && onClose ? (
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "hover:bg-muted mr-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm",
                isActive ? "opacity-70" : "opacity-0 group-hover:opacity-70 focus-visible:opacity-70",
              )}
              aria-label={closeLabel}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => onClose(event, tab.id)}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{closeLabel}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="mr-1 inline-flex size-4 shrink-0" aria-hidden="true" />
      )}
    </div>
  );
}

interface SortableRepoTabProps {
  tab: TabDisplayItem; isActive: boolean; tabIndex: number; tabCount: number;
  onSelect: (tabId: string) => void; onClose: (event: MouseEvent | KeyboardEvent, tabId: string) => void;
  onCloseTab: (tabId: string) => void; onCloseOthers: (tabId: string) => void; onCloseLeft: (tabId: string) => void; onCloseRight: (tabId: string) => void;
  onRemove: (project: Project) => void; onSetAlias: (project: Project) => void; onCopyRemote: (project: Project) => void; onCopyPath: (project: Project) => void;
  closeLabel: string; labels: Record<"close" | "remove" | "closeOthers" | "closeLeft" | "closeRight" | "setAlias" | "copyRemote" | "copyPath", string>;
}

function SortableRepoTab(props: SortableRepoTabProps) {
  const { tab, isActive, tabIndex, tabCount, onSelect, onClose, onCloseTab, onCloseOthers, onCloseLeft, onCloseRight, onRemove, onSetAlias, onCopyRemote, onCopyPath, closeLabel, labels } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });
  const project = tab.project;
  return <ContextMenu><ContextMenuTrigger asChild><div ref={setNodeRef} className={cn("flex h-7 items-center", isDragging && "opacity-40")} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners}><TabChrome tab={tab} isActive={isActive} onSelect={onSelect} onClose={onClose} closeLabel={closeLabel} /></div></ContextMenuTrigger>
    <ContextMenuContent className="min-w-40"><ContextMenuItem onSelect={() => onCloseTab(tab.id)}>{labels.close}</ContextMenuItem>
      {project ? <><ContextMenuItem onSelect={() => onRemove(project)}>{labels.remove}</ContextMenuItem><ContextMenuSeparator /></> : null}
      <ContextMenuItem disabled={tabCount <= 1} onSelect={() => onCloseOthers(tab.id)}>{labels.closeOthers}</ContextMenuItem><ContextMenuItem disabled={tabIndex === 0} onSelect={() => onCloseLeft(tab.id)}>{labels.closeLeft}</ContextMenuItem><ContextMenuItem disabled={tabIndex >= tabCount - 1} onSelect={() => onCloseRight(tab.id)}>{labels.closeRight}</ContextMenuItem>
      {project ? <><ContextMenuSeparator /><ContextMenuItem onSelect={() => onSetAlias(project)}>{labels.setAlias}</ContextMenuItem><ContextMenuItem onSelect={() => onCopyRemote(project)}>{labels.copyRemote}</ContextMenuItem><ContextMenuItem onSelect={() => onCopyPath(project)}>{labels.copyPath}</ContextMenuItem></> : null}
    </ContextMenuContent></ContextMenu>;
}

export function RepoTabBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const tabEntries = useOpenTabsStore((state) => state.tabs);
  const openNewTab = useOpenTabsStore((state) => state.openNewTab);
  const openRepositoryTab = useOpenTabsStore((state) => state.openRepositoryTab);
  const closeTab = useOpenTabsStore((state) => state.closeTab);
  const closeOtherTabs = useOpenTabsStore((state) => state.closeOtherTabs);
  const closeTabsToLeft = useOpenTabsStore((state) => state.closeTabsToLeft);
  const closeTabsToRight = useOpenTabsStore((state) => state.closeTabsToRight);
  const reorderTabs = useOpenTabsStore((state) => state.reorderTabs);
  const pruneTabs = useOpenTabsStore((state) => state.pruneTabs);
  const projects = useProjectStore((state) => state.projects);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const removeProject = useProjectStore((state) => state.removeProject);
  const updateAlias = useProjectStore((state) => state.updateAlias);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [aliasTarget, setAliasTarget] = useState<Project | null>(null);
  const [aliasValue, setAliasValue] = useState("");
  const [aliasBusy, setAliasBusy] = useState(false);
  /** 仅跟路由走，与 WorkspaceHost 显隐同一帧，避免标签/页面不同步 */
  const activeId = resolveActiveTabId(location.pathname, tabEntries);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const labels = useMemo(
    () => ({
      close: t("repo.tabClose"),
      remove: t("repo.tabRemove"),
      closeOthers: t("repo.tabCloseOthers"),
      closeLeft: t("repo.tabCloseLeft"),
      closeRight: t("repo.tabCloseRight"),
      setAlias: t("repo.tabSetAlias"),
      copyRemote: t("repo.tabCopyRemote"),
      copyPath: t("repo.tabCopyPath"),
    }),
    [t],
  );

  useEffect(() => {
    if (projects.length === 0) {
      void loadProjects();
    }
  }, [projects.length, loadProjects]);

  useEffect(() => {
    if (projects.length === 0) {
      return;
    }
    const valid = new Set(projects.map((project) => project.id));
    if (tabEntries.some((tab) => tab.type === "repository" && !valid.has(tab.projectId))) {
      pruneTabs(valid);
    }
  }, [projects, pruneTabs, tabEntries]);

  useEffect(() => {
    if (
      activeId &&
      location.pathname.startsWith("/repo/") &&
      !tabEntries.some((tab) => tab.id === activeId)
    ) {
      openRepositoryTab(activeId);
    }
  }, [activeId, location.pathname, openRepositoryTab, tabEntries]);

  const tabs = useMemo(() => {
    const byId = new Map(projects.map((project) => [project.id, project]));
    return tabEntries.flatMap((tab): TabDisplayItem[] => {
      if (tab.type === "new-tab") {
        return [{ id: tab.id, label: t("repo.newTab"), title: t("repo.newTab"), type: tab.type }];
      }
      const project = byId.get(tab.projectId);
      return project
        ? [{ id: tab.id, label: project.name, title: project.path, type: tab.type, project }]
        : [];
    });
  }, [projects, t, tabEntries]);

  const draggingTab = useMemo(
    () => tabs.find((tab) => tab.id === draggingId) ?? null,
    [draggingId, tabs],
  );

  /** 点击立即切路由；仓库数据由 RepoPage 后台加载 */
  function navigateToTab(tabId: string): void {
    const target = useOpenTabsStore.getState().tabs.find((tab) => tab.id === tabId);
    if (!target) {
      return;
    }
    if (target.type === "repository") {
      navigate(`/repo/${target.projectId}`);
    } else {
      navigate(`/tab/${target.id}`);
    }
  }

  /** 直接改路由；标签与页面都跟 pathname，同一提交内对齐（禁止 flushSync 同步大树） */
  function activateTab(navigateFn: () => void): void {
    navigateFn();
  }

  function syncRouteAfterTabsChange(preferredId?: string): void {
    const remaining = useOpenTabsStore.getState().tabs;
    if (activeId && remaining.some((tab) => tab.id === activeId)) {
      return;
    }
    const next = remaining.find((tab) => tab.id === preferredId) ?? remaining[0];
    if (next) {
      activateTab(() => navigateToTab(next.id));
      return;
    }
    const newTabId = openNewTab();
    activateTab(() => navigate(`/tab/${newTabId}`));
  }

  function handleSelect(tabId: string): void {
    if (tabId === activeId) {
      return;
    }
    activateTab(() => navigateToTab(tabId));
  }

  function closeOneTab(tabId: string): void {
    const nextId = closeTab(tabId);
    if (tabId === activeId) {
      if (nextId) {
        activateTab(() => navigateToTab(nextId));
      } else {
        const newTabId = openNewTab();
        activateTab(() => navigate(`/tab/${newTabId}`));
      }
    }
  }

  function handleClose(event: MouseEvent | KeyboardEvent, tabId: string): void {
    event.stopPropagation();
    event.preventDefault();
    closeOneTab(tabId);
  }

  async function handleRemove(project: Project): Promise<void> {
    try {
      await removeProject(project.id);
      closeTab(project.id);
      syncRouteAfterTabsChange();
      toast.success(t("repo.tabRemoveSuccess", { name: project.name }));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function submitAlias(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!aliasTarget) {
      return;
    }
    const next = aliasValue.trim();
    if (!next || next === aliasTarget.name) {
      return;
    }
    setAliasBusy(true);
    try {
      await updateAlias(aliasTarget.id, next);
      toast.success(t("repo.tabAliasSuccess", { name: next }));
      setAliasTarget(null);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setAliasBusy(false);
    }
  }

  async function handleCopyRemote(project: Project): Promise<void> {
    try {
      const url = pickPrimaryRemoteUrl(await gitService.listRemotes(project.path));
      if (!url) {
        toast.message(t("repo.tabCopyRemoteEmpty"));
        return;
      }
      await copyToClipboard(url);
      toast.success(t("repo.tabCopyRemoteSuccess"));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handleCopyPath(project: Project): Promise<void> {
    try {
      await copyToClipboard(project.path);
      toast.success(t("repo.tabCopyPathSuccess"));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event: DragStartEvent) => setDraggingId(String(event.active.id))}
        onDragEnd={(event: DragEndEvent) => {
          setDraggingId(null);
          if (event.over) {
            reorderTabs(String(event.active.id), String(event.over.id));
          }
        }}
        onDragCancel={() => setDraggingId(null)}
      >
        <header
          data-tauri-drag-region
          className={cn(
            "border-border bg-muted/40 relative flex h-12 shrink-0 items-center border-b pr-2 pl-[88px]",
            draggingId ? "z-[60]" : "z-40",
          )}
        >
          {/* 交互控件 no-drag；拖拽留白必须是兄弟节点，不能包在 no-drag 里（否则加载页无工具栏时窗口无法拖动） */}
          <div className="flex h-7 shrink-0 items-center gap-1.5" style={noDragStyle}>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground size-7 shrink-0"
                  aria-label={t("dashboard.openRepoAction")}
                  onClick={() => setDialogOpen(true)}
                >
                  <FolderPlus className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("dashboard.openRepoAction")}</TooltipContent>
            </Tooltip>
            <div className="bg-border h-3.5 w-px shrink-0 self-center" aria-hidden="true" />
          </div>
          <div
            className="flex h-7 min-w-0 items-center gap-1 overflow-x-auto"
            style={noDragStyle}
          >
            <SortableContext items={tabs.map((tab) => tab.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex h-7 items-center gap-1">
                {tabs.map((tab, index) => (
                  <SortableRepoTab
                    key={tab.id}
                    tab={tab}
                    isActive={tab.id === activeId}
                    tabIndex={index}
                    tabCount={tabs.length}
                    onSelect={handleSelect}
                    onClose={handleClose}
                    onCloseTab={closeOneTab}
                    onCloseOthers={(id) => {
                      closeOtherTabs(id);
                      syncRouteAfterTabsChange(id);
                    }}
                    onCloseLeft={(id) => {
                      closeTabsToLeft(id);
                      syncRouteAfterTabsChange(id);
                    }}
                    onCloseRight={(id) => {
                      closeTabsToRight(id);
                      syncRouteAfterTabsChange(id);
                    }}
                    onRemove={(project) => void handleRemove(project)}
                    onSetAlias={(project) => {
                      setAliasTarget(project);
                      setAliasValue(project.name);
                    }}
                    onCopyRemote={(project) => void handleCopyRemote(project)}
                    onCopyPath={(project) => void handleCopyPath(project)}
                    closeLabel={t("repo.closeTab", { name: tab.label })}
                    labels={labels}
                  />
                ))}
              </div>
            </SortableContext>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground size-7 shrink-0"
                  aria-label={t("repo.addTab")}
                  onClick={() => {
                    const tabId = openNewTab();
                    activateTab(() => navigate(`/tab/${tabId}`));
                  }}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.addTab")}</TooltipContent>
            </Tooltip>
          </div>
          <div data-tauri-drag-region className="h-full min-w-8 flex-1" />
        </header>
        <DragOverlay dropAnimation={null} style={{ zIndex: 100 }}>
          {draggingTab ? (
            <TabChrome tab={draggingTab} isActive={draggingTab.id === activeId} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>
      <OpenRepoDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <Dialog
        open={Boolean(aliasTarget)}
        onOpenChange={(open) => {
          if (!open && !aliasBusy) {
            setAliasTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-sm gap-4 p-5 sm:rounded-lg">
          <DialogHeader>
            <DialogTitle>{t("repo.tabAliasTitle")}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void submitAlias(event)}>
            <Input
              value={aliasValue}
              onChange={(event) => setAliasValue(event.target.value)}
              placeholder={t("openRepo.aliasPlaceholder")}
              autoFocus
              disabled={aliasBusy}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={aliasBusy}
                onClick={() => setAliasTarget(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  aliasBusy ||
                  !aliasValue.trim() ||
                  aliasValue.trim() === aliasTarget?.name
                }
              >
                {t("repo.tabAliasSave")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
