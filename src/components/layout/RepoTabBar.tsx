import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
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

import { OpenRepoDialog } from "@/components/project/OpenRepoDialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useRepoStore } from "@/store/useRepoStore";

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
        dragging && "bg-primary/10 text-primary shadow-sm ring-1 ring-border",
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
          <TooltipContent side="bottom">{closeLabel}</TooltipContent>
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
  onSelect: (projectId: string) => void;
  onClose: (event: MouseEvent | KeyboardEvent, projectId: string) => void;
  closeLabel: string;
}

function SortableRepoTab({
  project,
  isActive,
  loading = false,
  onSelect,
  onClose,
  closeLabel,
}: SortableRepoTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  return (
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
  const reorderTabs = useOpenTabsStore((state) => state.reorderTabs);
  const pruneTabs = useOpenTabsStore((state) => state.pruneTabs);

  const projects = useProjectStore((state) => state.projects);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const repoLoading = useRepoStore((state) => state.loading);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** 点击后、仓库数据就绪前：目标标签显示 loading */
  const [pendingId, setPendingId] = useState<string | null>(null);

  const activeId = resolveActiveProjectId(location.pathname);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
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

  function handleSelect(projectId: string): void {
    if (projectId === activeId) {
      return;
    }

    // 立刻在目标标签上反馈 loading，再导航
    setPendingId(projectId);
    openTab(projectId);
    navigate(`/repo/${projectId}`);
  }

  function handleClose(event: MouseEvent | KeyboardEvent, projectId: string): void {
    event.stopPropagation();
    event.preventDefault();

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
              <TooltipContent side="bottom">{t("dashboard.openRepoAction")}</TooltipContent>
            </Tooltip>

            <div className="bg-border h-3.5 w-px shrink-0 self-center" aria-hidden="true" />

            <div className="flex h-7 min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
                <div className="flex h-7 items-center gap-1">
                  {tabs.map((project) => (
                    <SortableRepoTab
                      key={project.id}
                      project={project}
                      isActive={project.id === activeId}
                      loading={project.id === pendingId}
                      onSelect={handleSelect}
                      onClose={handleClose}
                      closeLabel={t("repo.closeTab", { name: project.name })}
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
                <TooltipContent side="bottom">{t("repo.addTab")}</TooltipContent>
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
    </>
  );
}
