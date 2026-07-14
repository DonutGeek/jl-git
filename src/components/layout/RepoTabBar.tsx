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
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FolderPlus, Loader2, Plus, X } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useRepoStore } from "@/store/useRepoStore";

import { gitService } from "@/services/git";
import { pickPrimaryRemoteUrl } from "@/services/git/git.remote";
import { copyToClipboard } from "@/utils/clipboard";

import { toUserMessage } from "@/types/error";
import { Project } from "@/types/project";

/** 可交互控件禁止拖窗 */
const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

function resolveActiveProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/repo\/([^/]+)/);
  return match?.[1] ?? null;
}

interface TabChromeProps {
  project: Project;
  isActive: boolean;
  /** 切换仓库加载中：标签内显示转圈 */
  loading?: boolean;
  dragging?: boolean;
  onSelect?: (projectId: string) => void;
  onClose?: (event: MouseEvent | KeyboardEvent, projectId: string) => void;
  closeLabel?: string;
}

/** 标签外观：列表项与 DragOverlay 共用，避免样式分叉 */
function TabChrome({
  project,
  isActive,
  loading = false,
  dragging = false,
  onSelect,
  onClose,
  closeLabel,
}: TabChromeProps) {
  return (
    <div
      className={cn(
        "group relative flex h-7 max-w-[180px] items-center gap-0.5 rounded-md pl-2.5 font-mono text-xs leading-none transition-colors",
        // 选中态与工具栏「工作区 / 变更 / 历史」一致
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent/60",
        dragging && "bg-primary/10 text-primary ring-1 ring-border",
        loading && "opacity-90",
      )}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <Loader2
          className="text-primary mr-0.5 size-3 shrink-0 animate-spin"
          aria-hidden="true"
        />
      ) : null}
      <button
        type="button"
        className={cn(
          "min-w-0 flex-1 truncate py-0 text-left leading-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onClick={() => onSelect?.(project.id)}
        title={project.path}
        aria-current={isActive ? "page" : undefined}
        tabIndex={dragging ? -1 : undefined}
      >
        {project.name}
      </button>
      {closeLabel && onClose ? (
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "hover:bg-muted mr-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm",
                loading
                  ? "opacity-0"
                  : isActive
                    ? "opacity-70"
                    : "opacity-0 group-hover:opacity-70 focus-visible:opacity-70",
              )}
              aria-label={closeLabel}
              disabled={loading}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => onClose(event, project.id)}
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
  project: Project;
  isActive: boolean;
  loading?: boolean;
  tabIndex: number;
  tabCount: number;
  onSelect: (projectId: string) => void;
  onClose: (event: MouseEvent | KeyboardEvent, projectId: string) => void;
  onCloseTab: (projectId: string) => void;
  onCloseOthers: (projectId: string) => void;
  onCloseLeft: (projectId: string) => void;
  onCloseRight: (projectId: string) => void;
  onRemove: (project: Project) => void;
  onSetAlias: (project: Project) => void;
  onCopyRemote: (project: Project) => void;
  onCopyPath: (project: Project) => void;
  closeLabel: string;
  labels: {
    close: string;
    remove: string;
    closeOthers: string;
    closeLeft: string;
    closeRight: string;
    setAlias: string;
    copyRemote: string;
    copyPath: string;
  };
}

function SortableRepoTab({
  project,
  isActive,
  loading = false,
  tabIndex,
  tabCount,
  onSelect,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseLeft,
  onCloseRight,
  onRemove,
  onSetAlias,
  onCopyRemote,
  onCopyPath,
  closeLabel,
  labels,
}: SortableRepoTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  const hasLeft = tabIndex > 0;
  const hasRight = tabIndex < tabCount - 1;
  const hasOthers = tabCount > 1;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          className={cn("flex h-7 items-center", isDragging && "opacity-40")}
          style={{
            transform: CSS.Transform.toString(transform),
            transition,
          }}
          {...attributes}
          {...listeners}
        >
          <TabChrome
            project={project}
            isActive={isActive}
            loading={loading}
            onSelect={onSelect}
            onClose={onClose}
            closeLabel={closeLabel}
          />
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-40">
        <ContextMenuItem onSelect={() => onCloseTab(project.id)}>{labels.close}</ContextMenuItem>
        <ContextMenuItem onSelect={() => onRemove(project)}>{labels.remove}</ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem disabled={!hasOthers} onSelect={() => onCloseOthers(project.id)}>
          {labels.closeOthers}
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasLeft} onSelect={() => onCloseLeft(project.id)}>
          {labels.closeLeft}
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasRight} onSelect={() => onCloseRight(project.id)}>
          {labels.closeRight}
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onSelect={() => onSetAlias(project)}>{labels.setAlias}</ContextMenuItem>
        <ContextMenuItem onSelect={() => onCopyRemote(project)}>
          {labels.copyRemote}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCopyPath(project)}>{labels.copyPath}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** 顶栏仓库标签：紧凑间距；整标签拖拽排序（DragOverlay 避免被工具栏裁切） */
export function RepoTabBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const tabIds = useOpenTabsStore((state) => state.tabIds);
  const openTab = useOpenTabsStore((state) => state.openTab);
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
  const repoLoading = useRepoStore((state) => state.loading);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** 点击后、仓库数据就绪前：目标标签显示 loading */
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [aliasTarget, setAliasTarget] = useState<Project | null>(null);
  const [aliasValue, setAliasValue] = useState("");
  const [aliasBusy, setAliasBusy] = useState(false);

  const activeId = resolveActiveProjectId(location.pathname);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const menuLabels = useMemo(
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
    const validIds = new Set(projects.map((project) => project.id));
    const currentTabIds = useOpenTabsStore.getState().tabIds;
    // 仅在确有无效 id 时 prune，避免无意义 store 通知
    if (currentTabIds.some((id) => !validIds.has(id))) {
      pruneTabs(validIds);
    }
  }, [projects, pruneTabs]);

  useEffect(() => {
    if (activeId && !tabIds.includes(activeId)) {
      openTab(activeId);
    }
    // openTab 幂等；tabIds 变化后若已包含则不再写入
  }, [activeId, tabIds, openTab]);

  // 目标仓库加载结束后清除标签 loading
  useEffect(() => {
    if (!pendingId) {
      return;
    }
    if (activeId === pendingId && !repoLoading) {
      setPendingId(null);
    }
  }, [pendingId, activeId, repoLoading]);

  const tabs = useMemo(() => {
    const byId = new Map(projects.map((project) => [project.id, project]));
    return tabIds
      .map((id) => byId.get(id))
      .filter((project): project is Project => Boolean(project));
  }, [tabIds, projects]);

  const draggingProject = useMemo(() => {
    if (!draggingId) {
      return null;
    }
    return tabs.find((project) => project.id === draggingId) ?? null;
  }, [draggingId, tabs]);

  /** 批量关标签后：若当前路由对应标签已不在，跳到 preferred 或首个剩余 */
  function syncRouteAfterTabsChange(preferredId?: string): void {
    const remaining = useOpenTabsStore.getState().tabIds;
    if (activeId && remaining.includes(activeId)) {
      return;
    }

    const next =
      preferredId && remaining.includes(preferredId)
        ? preferredId
        : (remaining[0] ?? null);

    if (next) {
      setPendingId(next);
      navigate(`/repo/${next}`);
      return;
    }

    navigate("/");
  }

  function handleSelect(projectId: string): void {
    if (projectId === activeId) {
      return;
    }

    // 立刻在目标标签上反馈 loading，再导航
    setPendingId(projectId);
    openTab(projectId);
    navigate(`/repo/${projectId}`);
  }

  function closeOneTab(projectId: string): void {
    if (projectId === pendingId) {
      setPendingId(null);
    }

    const nextId = closeTab(projectId);

    if (projectId !== activeId) {
      return;
    }

    if (nextId) {
      setPendingId(nextId);
      navigate(`/repo/${nextId}`);
      return;
    }

    navigate("/");
  }

  function handleClose(event: MouseEvent | KeyboardEvent, projectId: string): void {
    event.stopPropagation();
    event.preventDefault();
    closeOneTab(projectId);
  }

  function handleCloseOthers(projectId: string): void {
    closeOtherTabs(projectId);
    syncRouteAfterTabsChange(projectId);
  }

  function handleCloseLeft(projectId: string): void {
    closeTabsToLeft(projectId);
    syncRouteAfterTabsChange(projectId);
  }

  function handleCloseRight(projectId: string): void {
    closeTabsToRight(projectId);
    syncRouteAfterTabsChange(projectId);
  }

  async function handleRemove(project: Project): Promise<void> {
    try {
      await removeProject(project.id);
      // pruneTabs 可能已清掉该 id；closeTab 幂等
      closeTab(project.id);
      syncRouteAfterTabsChange();
      toast.success(t("repo.tabRemoveSuccess", { name: project.name }));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  function handleSetAlias(project: Project): void {
    setAliasTarget(project);
    setAliasValue(project.name);
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
      const remotes = await gitService.listRemotes(project.path);
      const url = pickPrimaryRemoteUrl(remotes);
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

  function handleDragStart(event: DragStartEvent): void {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    setDraggingId(null);

    if (!over) {
      return;
    }

    reorderTabs(String(active.id), String(over.id));
  }

  function handleDragCancel(): void {
    setDraggingId(null);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* 顶栏控件与原生红绿灯同处一条视觉中心线，并留出明确间隔。 */}
        <header
          data-tauri-drag-region
          className={cn(
            "border-border bg-muted/40 relative flex h-12 shrink-0 items-center border-b pr-2 pl-[88px]",
            draggingId ? "z-[60]" : "z-40",
          )}
        >
          <div
            className="flex h-7 min-w-0 flex-1 items-center gap-1.5"
            style={noDragStyle}
          >
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

            <div className="flex h-7 min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
                <div className="flex h-7 items-center gap-1">
                  {tabs.map((project, index) => (
                    <SortableRepoTab
                      key={project.id}
                      project={project}
                      isActive={project.id === activeId}
                      loading={project.id === pendingId}
                      tabIndex={index}
                      tabCount={tabs.length}
                      onSelect={handleSelect}
                      onClose={handleClose}
                      onCloseTab={closeOneTab}
                      onCloseOthers={handleCloseOthers}
                      onCloseLeft={handleCloseLeft}
                      onCloseRight={handleCloseRight}
                      onRemove={(item) => void handleRemove(item)}
                      onSetAlias={handleSetAlias}
                      onCopyRemote={(item) => void handleCopyRemote(item)}
                      onCopyPath={(item) => void handleCopyPath(item)}
                      closeLabel={t("repo.closeTab", { name: project.name })}
                      labels={menuLabels}
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
                    onClick={() => setDialogOpen(true)}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("repo.addTab")}</TooltipContent>
              </Tooltip>

              <div data-tauri-drag-region className="h-7 min-w-4 flex-1" />
            </div>
          </div>
        </header>

        {/* Portal 到 body，避免被 overflow / 下级工具栏裁切遮盖 */}
        <DragOverlay dropAnimation={null} style={{ zIndex: 100 }}>
          {draggingProject ? (
            <TabChrome
              project={draggingProject}
              isActive={draggingProject.id === activeId}
              dragging
            />
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
