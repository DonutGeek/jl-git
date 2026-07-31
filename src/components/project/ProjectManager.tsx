import type { FormEvent } from "react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Folder,
  FolderKanban,
  FolderOpen,
  FolderTree,
  GitBranchPlus,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  Lock,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";

import { HighlightText } from "@/components/common/HighlightText";
import { LucideIconPicker } from "@/components/common/LucideIconPicker";
import { CloneRepoPanel } from "@/components/project/CloneRepoPanel";
import { ProjectContextMenu } from "@/components/project/ProjectContextMenu";
import { ProjectDescriptionField } from "@/components/project/ProjectDescriptionField";
import { lucideIconPickerI18n } from "@/components/project/lucideIconPickerI18n";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { ExistingProjectDialog } from "@/components/project/ProjectUniquenessDialogs";
import { RecentProjectList } from "@/components/project/RecentProjectList";
import { WorkspaceGroupDialog } from "@/components/project/WorkspaceGroupDialog";
import { WorkspaceSelectMenu } from "@/components/project/WorkspaceSelectMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { projectService } from "@/services/project";
import { openProjectManageWindow } from "@/services/window/projectManageWindow";
import { useProjectStore } from "@/store/useProjectStore";
import { toUserMessage } from "@/types/error";
import type { Project, Workspace } from "@/types/project";
import { DEFAULT_PROJECT_ICON, type ProjectIcon as ProjectIconName } from "@/types/project";
import type { NewTabProjectManagerView } from "@/utils/newTabNavigation";
import { buildProjectOrderItems } from "@/utils/projectGroupOrder";

interface ProjectManagerProps {
  onOpenProject: (projectId: string) => void;
  /** 外部导航请求打开某视图（如全局搜索 → 打开 / 克隆） */
  requestedView?: NewTabProjectManagerView | null;
  onRequestedViewConsumed?: () => void;
}

type View = "recent" | "open" | "clone" | "groups";

/** workspace/project：可排序项；container：仅投放目标（如根「无分组」） */
interface DragEntry {
  type: "workspace" | "project" | "container";
  workspaceId: string | null;
  parentId: string | null;
  label?: string;
  icon?: ProjectIconName;
}

/** 同级混合列表项（分组与仓库共用 sortOrder 空间） */
type MixedTreeItem =
  | {
      kind: "workspace";
      sortableId: string;
      sortOrder: number;
      name: string;
      workspace: Workspace;
    }
  | {
      kind: "project";
      sortableId: string;
      sortOrder: number;
      name: string;
      project: Project;
    };

function compareMixedTreeItems(a: MixedTreeItem, b: MixedTreeItem): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  // sortOrder 相同时：仓库在前、分组在后，贴近历史默认布局
  if (a.kind !== b.kind) {
    return a.kind === "project" ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

function SortableGroupItem({
  id,
  entry,
  acceptProjectDrop = false,
  disabled = false,
  className,
  children,
}: {
  id: string;
  entry: DragEntry;
  /** 分组行可作为项目投放目标 */
  acceptProjectDrop?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id,
      data: entry,
      disabled,
    });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        className,
        // 拖拽中隐藏原行，由 DragOverlay 展示，避免缩成小胶囊
        isDragging && "opacity-0",
        acceptProjectDrop && isOver && !isDragging && "bg-primary/10 ring-primary/25 ring-1",
      )}
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
    >
      {children}
    </div>
  );
}

/** 根「无分组」投放区 */
function RootDropZone({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "drop-root",
    data: { type: "container", workspaceId: null, parentId: null } satisfies DragEntry,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn("rounded-md", isOver && "bg-primary/10 ring-primary/25 ring-1")}
    >
      {children}
    </div>
  );
}

function getProjectName(path: string): string {
  const normalizedPath = path.trim().replace(/[\\/]+$/, "");
  const parts = normalizedPath.split(/[\\/]/);

  return parts[parts.length - 1] ?? "";
}

/** 新标签页中的仓库管理入口。 */
export function ProjectManager({
  onOpenProject,
  requestedView = null,
  onRequestedViewConsumed,
}: ProjectManagerProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("recent");
  const [filter, setFilter] = useState("");
  const [path, setPath] = useState("");
  const [alias, setAlias] = useState("");
  const [aliasEdited, setAliasEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [descriptionGenerating, setDescriptionGenerating] = useState(false);
  const [projectIcon, setProjectIcon] = useState<ProjectIconName>(DEFAULT_PROJECT_ICON);
  const [workspaceId, setWorkspaceId] = useState("");
  const [opening, setOpening] = useState(false);
  const [picking, setPicking] = useState(false);
  const [groupDialog, setGroupDialog] = useState<
    { mode: "create"; parentId: string | null } | { mode: "edit"; workspace: Workspace } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [rootExpanded, setRootExpanded] = useState(true);
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<Set<string>>(new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragEntry | null>(null);
  const [existingProject, setExistingProject] = useState<Project | null>(null);

  useEffect(() => {
    if (requestedView !== "open" && requestedView !== "clone") {
      return;
    }
    setView(requestedView);
    onRequestedViewConsumed?.();
  }, [onRequestedViewConsumed, requestedView]);

  const projects = useProjectStore((state) => state.projects);
  const workspaces = useProjectStore((state) => state.workspaces);
  const addAndOpen = useProjectStore((state) => state.addAndOpen);
  const addProject = useProjectStore((state) => state.addProject);
  const openExisting = useProjectStore((state) => state.openExisting);
  const removeWorkspace = useProjectStore((state) => state.removeWorkspace);
  const reorderGroupedItems = useProjectStore((state) => state.reorderGroupedItems);
  const query = filter.trim().toLowerCase();
  const visibleProjects = useMemo(
    () =>
      query
        ? projects.filter(
            (item) =>
              item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query),
          )
        : projects,
    [projects, query],
  );
  const nav = [
    { id: "recent" as const, label: t("projectManager.recent"), icon: History },
    { id: "open" as const, label: t("projectManager.open"), icon: FolderOpen },
    { id: "clone" as const, label: t("projectManager.clone"), icon: GitBranchPlus },
    { id: "groups" as const, label: t("projectManager.groups"), icon: FolderTree },
    { id: "manage" as const, label: t("projectManager.manage"), icon: FolderKanban },
  ];
  const rootWorkspaces = useMemo(
    () =>
      workspaces
        .filter(
          (workspace) =>
            workspace.parentId === null ||
            !workspaces.some((item) => item.id === workspace.parentId),
        )
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [workspaces],
  );
  const rootProjects = useMemo(
    () =>
      visibleProjects
        .filter((project) => project.workspaceId === null)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [visibleProjects],
  );
  const rootMixedItems = useMemo(() => {
    const mixed: MixedTreeItem[] = [
      ...rootWorkspaces.map((workspace) => ({
        kind: "workspace" as const,
        sortableId: `workspace-${workspace.id}`,
        sortOrder: workspace.sortOrder,
        name: workspace.name,
        workspace,
      })),
      ...rootProjects.map((project) => ({
        kind: "project" as const,
        sortableId: `project-${project.id}`,
        sortOrder: project.sortOrder,
        name: project.name,
        project,
      })),
    ];
    return mixed.sort(compareMixedTreeItems);
  }, [rootProjects, rootWorkspaces]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dragging = activeDrag !== null;

  function projectsInWorkspace(workspaceId: string | null): Project[] {
    return projects
      .filter((item) => item.workspaceId === workspaceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  /** 某父级下的分组 + 仓库混合列表（共用 sortOrder） */
  function buildMixedItems(parentId: string | null): MixedTreeItem[] {
    if (parentId === null) {
      return rootMixedItems;
    }

    const childWorkspaces = workspaces
      .filter((item) => item.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const childProjects = visibleProjects.filter((project) => project.workspaceId === parentId);

    const mixed: MixedTreeItem[] = [
      ...childWorkspaces.map((workspace) => ({
        kind: "workspace" as const,
        sortableId: `workspace-${workspace.id}`,
        sortOrder: workspace.sortOrder,
        name: workspace.name,
        workspace,
      })),
      ...childProjects.map((project) => ({
        kind: "project" as const,
        sortableId: `project-${project.id}`,
        sortOrder: project.sortOrder,
        name: project.name,
        project,
      })),
    ];
    return mixed.sort(compareMixedTreeItems);
  }

  async function persistProjectMove(
    groups: Array<{ workspaceId: string | null; projectIds: string[] }>,
  ): Promise<void> {
    await reorderGroupedItems({
      workspaces: [],
      projects: buildProjectOrderItems(groups),
    });
  }

  /** 同级混合排序（分组可在仓库间上下拖动） */
  async function persistMixedReorder(
    parentId: string | null,
    activeSortableId: string,
    overSortableId: string,
  ): Promise<void> {
    const mixed = buildMixedItems(parentId);
    const oldIndex = mixed.findIndex((item) => item.sortableId === activeSortableId);
    const newIndex = mixed.findIndex((item) => item.sortableId === overSortableId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return;
    }

    const next = arrayMove(mixed, oldIndex, newIndex);
    const workspaceOrders: Array<{ id: string; sortOrder: number }> = [];
    const projectOrders: Array<{ id: string; workspaceId: string | null; sortOrder: number }> = [];

    next.forEach((item, sortOrder) => {
      if (item.kind === "workspace") {
        workspaceOrders.push({ id: item.workspace.id, sortOrder });
      } else {
        projectOrders.push({
          id: item.project.id,
          workspaceId: parentId,
          sortOrder,
        });
      }
    });

    await reorderGroupedItems({
      workspaces: workspaceOrders,
      projects: projectOrders,
    });
  }

  /** 将项目移到目标分组末尾（含移至无分组） */
  async function moveProjectToWorkspace(
    projectId: string,
    fromWorkspaceId: string | null,
    toWorkspaceId: string | null,
  ): Promise<void> {
    if (fromWorkspaceId === toWorkspaceId) {
      return;
    }
    if (
      (fromWorkspaceId && workspaces.find((item) => item.id === fromWorkspaceId)?.locked) ||
      (toWorkspaceId && workspaces.find((item) => item.id === toWorkspaceId)?.locked)
    ) {
      toast.error(t("projectManager.lockedGroupMoveBlocked"));
      return;
    }
    const source = projectsInWorkspace(fromWorkspaceId);
    const target = projectsInWorkspace(toWorkspaceId);
    if (!source.some((item) => item.id === projectId)) {
      return;
    }
    await persistProjectMove([
      {
        workspaceId: fromWorkspaceId,
        projectIds: source.filter((item) => item.id !== projectId).map((item) => item.id),
      },
      { workspaceId: toWorkspaceId, projectIds: [...target.map((item) => item.id), projectId] },
    ]);
    if (toWorkspaceId) {
      setCollapsedWorkspaceIds((current) => {
        const next = new Set(current);
        next.delete(toWorkspaceId);
        return next;
      });
    }
    setRootExpanded(true);
  }

  function handleGroupDragStart(event: DragStartEvent): void {
    const entry = event.active.data.current as DragEntry | undefined;
    setActiveDrag(entry ?? null);
  }

  async function handleGroupDragEnd(event: DragEndEvent): Promise<void> {
    const active = event.active.data.current as DragEntry | undefined;
    const over = event.over?.data.current as DragEntry | undefined;
    setActiveDrag(null);

    if (!active || !over || event.active.id === event.over?.id) {
      return;
    }

    const activeSortableId = String(event.active.id);
    const overSortableId = String(event.over?.id ?? "");

    try {
      // 拖动分组：与同级分组或同级仓库重排
      if (active.type === "workspace") {
        const activeWorkspace = workspaces.find((item) => item.id === active.workspaceId);
        if (activeWorkspace?.locked) {
          toast.error(t("projectManager.lockedGroupDragBlocked"));
          return;
        }
        const sameLevelWorkspace = over.type === "workspace" && over.parentId === active.parentId;
        const sameLevelProject = over.type === "project" && over.workspaceId === active.parentId;
        if (sameLevelWorkspace || sameLevelProject) {
          await persistMixedReorder(active.parentId, activeSortableId, overSortableId);
        }
        return;
      }

      if (active.type !== "project") {
        return;
      }

      const activeId = activeSortableId.replace("project-", "");

      // 投放到分组行或根「无分组」容器 → 移入该分组
      if (over.type === "workspace" || over.type === "container") {
        await moveProjectToWorkspace(activeId, active.workspaceId, over.workspaceId);
        return;
      }

      if (over.type !== "project") {
        return;
      }

      const overId = overSortableId.replace("project-", "");

      // 同级（含根下混排）：与分组共用顺序
      if (active.workspaceId === over.workspaceId) {
        await persistMixedReorder(active.workspaceId, activeSortableId, overSortableId);
        return;
      }

      // 跨分组：落到目标组内指定位置
      if (
        (active.workspaceId && workspaces.find((item) => item.id === active.workspaceId)?.locked) ||
        (over.workspaceId && workspaces.find((item) => item.id === over.workspaceId)?.locked)
      ) {
        toast.error(t("projectManager.lockedGroupMoveBlocked"));
        return;
      }
      const source = projectsInWorkspace(active.workspaceId);
      const target = projectsInWorkspace(over.workspaceId);
      const sourceIndex = source.findIndex((item) => item.id === activeId);
      const targetIndex = target.findIndex((item) => item.id === overId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return;
      }

      const nextSource = source.filter((item) => item.id !== activeId);
      const moved = source[sourceIndex];
      if (!moved) {
        return;
      }
      const nextTarget = [...target.slice(0, targetIndex), moved, ...target.slice(targetIndex)];
      await persistProjectMove([
        { workspaceId: active.workspaceId, projectIds: nextSource.map((item) => item.id) },
        { workspaceId: over.workspaceId, projectIds: nextTarget.map((item) => item.id) },
      ]);
      if (over.workspaceId) {
        setCollapsedWorkspaceIds((current) => {
          const next = new Set(current);
          next.delete(over.workspaceId as string);
          return next;
        });
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  function handlePathChange(value: string): void {
    setPath(value);
    if (!aliasEdited) {
      setAlias(getProjectName(value));
    }
  }

  function handleAliasChange(value: string): void {
    setAliasEdited(true);
    setAlias(value);
  }

  async function pickPath(): Promise<void> {
    if (picking || opening) {
      return;
    }
    // 先发起选目录 IPC，再改按钮态，避免重渲染抢主线程导致面板晚弹出
    const pickPromise = projectService.pickDirectory();
    setPicking(true);

    try {
      const selected = await pickPromise;
      if (selected) {
        handlePathChange(selected);
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setPicking(false);
    }
  }

  function resetOpenForm(): void {
    setPath("");
    setAlias("");
    setAliasEdited(false);
    setDescription("");
    setDescriptionGenerating(false);
    setProjectIcon(DEFAULT_PROJECT_ICON);
    setWorkspaceId("");
  }

  async function submitOpen(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const repositoryPath = path.trim();
    if (!repositoryPath || opening || descriptionGenerating) {
      return;
    }

    setOpening(true);

    try {
      const result = await addAndOpen({
        path: repositoryPath,
        name: alias.trim() || undefined,
        workspaceId: workspaceId || undefined,
        description: description.trim() || undefined,
        icon: projectIcon,
      });
      if (result.alreadyExists) {
        setExistingProject(result.project);
        return;
      }
      resetOpenForm();
      onOpenProject(result.project.id);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setOpening(false);
    }
  }

  /** 仅保存仓库记录并清空表单，便于连续添加多个仓库（不跳转打开） */
  async function saveAndContinue(): Promise<void> {
    const repositoryPath = path.trim();
    if (!repositoryPath || opening || descriptionGenerating) {
      return;
    }

    setOpening(true);

    try {
      const result = await addProject({
        path: repositoryPath,
        name: alias.trim() || undefined,
        workspaceId: workspaceId || undefined,
        description: description.trim() || undefined,
        icon: projectIcon,
      });
      if (result.alreadyExists) {
        setExistingProject(result.project);
        return;
      }
      resetOpenForm();
      toast.success(t("openRepo.saveAndContinueSuccess", { name: result.project.name }));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setOpening(false);
    }
  }

  async function confirmExistingProject(project: Project): Promise<void> {
    setExistingProject(null);
    resetOpenForm();
    try {
      await openExisting(project.id);
      onOpenProject(project.id);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  function startCreateGroup(parentId: string | null): void {
    setGroupDialog({ mode: "create", parentId });
  }

  function startEditGroup(workspace: Workspace): void {
    setGroupDialog({ mode: "edit", workspace });
  }

  async function confirmDeleteGroup(): Promise<void> {
    if (!deleteTarget || deleteBusy) {
      return;
    }
    if (deleteTarget.locked) {
      toast.error(t("projectManager.lockedGroupDeleteBlocked"));
      return;
    }
    setDeleteBusy(true);
    try {
      await removeWorkspace(deleteTarget.id);
      toast.success(t("projectManager.deleteGroupSuccess", { name: deleteTarget.name }));
      setDeleteTarget(null);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  function openGroupProject(projectId: string): void {
    if (opening || dragging) {
      return;
    }
    setSelectedProjectId(projectId);
    onOpenProject(projectId);
  }

  /** 分组树内的仓库行：缩进在高亮外，避免左侧灰边嵌套感 */
  function renderGroupProject(project: Project, depth: number) {
    const isSelected = selectedProjectId === project.id;

    return (
      <div key={project.id} style={{ paddingLeft: `${depth * 20}px` }}>
        <SortableGroupItem
          id={`project-${project.id}`}
          entry={{
            type: "project",
            workspaceId: project.workspaceId,
            parentId: null,
            label: project.name,
            icon: project.icon,
          }}
        >
          <ProjectContextMenu
            project={project}
            onOpenProject={openGroupProject}
            disabled={opening || dragging}
            onMenuOpen={() => setSelectedProjectId(project.id)}
          >
            <button
              type="button"
              disabled={opening || dragging}
              className={cn(
                "focus-visible:ring-ring group relative flex h-9 w-full min-w-0 cursor-grab items-center gap-2.5 rounded-md px-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing",
                isSelected ? "bg-accent hover:bg-accent" : "hover:bg-accent/60",
              )}
              onClick={() => {
                if (!opening && !dragging) {
                  // 再次点击已选项则取消选中
                  setSelectedProjectId((current) => (current === project.id ? null : project.id));
                }
              }}
              onDoubleClick={() => openGroupProject(project.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && isSelected) {
                  event.preventDefault();
                  openGroupProject(project.id);
                }
              }}
            >
              <span
                className={cn(
                  "text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
                  isSelected
                    ? "bg-muted-foreground/12 ring-border/60 ring-1 ring-inset"
                    : "bg-muted group-hover:bg-muted-foreground/10 group-focus-visible:bg-muted-foreground/10",
                )}
              >
                <ProjectIcon name={project.icon} className="size-3.5" />
              </span>
              <HighlightText
                text={project.name}
                query={filter}
                className="min-w-0 flex-1 truncate text-sm font-medium"
              />
            </button>
          </ProjectContextMenu>
        </SortableGroupItem>
      </div>
    );
  }

  function renderWorkspace(workspace: Workspace, depth: number) {
    const expanded = !collapsedWorkspaceIds.has(workspace.id);
    const mixedChildren = buildMixedItems(workspace.id);

    return (
      <div key={workspace.id} className="space-y-0.5">
        {/* 缩进在高亮外；整行（含 +）共用同一 hover，避免灰底套白块 */}
        <div style={{ paddingLeft: `${depth * 20}px` }}>
          <SortableGroupItem
            id={`workspace-${workspace.id}`}
            entry={{
              type: "workspace",
              workspaceId: workspace.id,
              parentId: workspace.parentId,
              label: workspace.name,
            }}
            acceptProjectDrop={!workspace.locked}
            disabled={workspace.locked}
            className="group/row hover:bg-accent/60 flex h-9 w-full items-center gap-0.5 rounded-md transition-colors"
          >
            <button
              type="button"
              className={cn(
                "focus-visible:ring-ring flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
                workspace.locked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
              )}
              onClick={() =>
                setCollapsedWorkspaceIds((current) => {
                  const next = new Set(current);
                  if (next.has(workspace.id)) {
                    next.delete(workspace.id);
                  } else {
                    next.add(workspace.id);
                  }
                  return next;
                })
              }
            >
              <ChevronDown
                className={cn(
                  "text-muted-foreground size-3.5 shrink-0 transition-transform",
                  !expanded && "-rotate-90",
                )}
                aria-hidden="true"
              />
              <Folder className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate font-medium">{workspace.name}</span>
              {workspace.locked ? (
                <Lock
                  className="text-muted-foreground size-3.5 shrink-0 opacity-80"
                  aria-hidden="true"
                />
              ) : null}
            </button>
            <div className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("projectManager.createChildGroup", { name: workspace.name })}
                    disabled={opening || dragging}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => startCreateGroup(workspace.id)}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("projectManager.createChildGroup", { name: workspace.name })}
                </TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("projectManager.editGroup")}
                    disabled={opening || dragging}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => startEditGroup(workspace)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("projectManager.editGroup")}</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    aria-label={t("projectManager.deleteGroup")}
                    disabled={opening || dragging || workspace.locked}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setDeleteTarget(workspace)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {workspace.locked
                    ? t("projectManager.lockedGroupDeleteBlocked")
                    : t("projectManager.deleteGroup")}
                </TooltipContent>
              </Tooltip>
            </div>
          </SortableGroupItem>
        </div>
        {expanded ? (
          <SortableContext
            items={mixedChildren.map((item) => item.sortableId)}
            strategy={verticalListSortingStrategy}
          >
            {mixedChildren.map((item) =>
              item.kind === "workspace"
                ? renderWorkspace(item.workspace, depth + 1)
                : renderGroupProject(item.project, depth + 1),
            )}
          </SortableContext>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-48 shrink-0 flex-col gap-1 p-3">
        {nav.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            className={cn("justify-start gap-2", view === item.id && "bg-accent")}
            onClick={() => {
              if (item.id === "manage") {
                void openProjectManageWindow().catch((error: unknown) => {
                  toast.error(toUserMessage(error) || t("projectManager.manageOpenFailed"));
                });
                return;
              }
              setView(item.id);
            }}
            disabled={opening}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Button>
        ))}
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col px-6 pt-3 pb-6">
        {view === "recent" ? <RecentProjectList onOpenProject={onOpenProject} /> : null}

        {view === "clone" ? (
          <CloneRepoPanel onOpenProject={onOpenProject} disabled={opening} />
        ) : null}

        {view === "open" ? (
          <ScrollArea className="-mr-6 min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
            {/* pl/py：给 focus ring 留空，避免被 ScrollArea overflow-hidden 裁切 */}
            <form
              className="max-w-2xl min-w-0 space-y-6 py-1 pr-6 pl-2 pb-2"
              onSubmit={(event) => void submitOpen(event)}
            >
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="project-manager-path">{t("openRepo.pathLabel")}</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="project-manager-path"
                      value={path}
                      onChange={(event) => handlePathChange(event.target.value)}
                      placeholder={t("openRepo.pathPlaceholder")}
                      autoComplete="off"
                      disabled={opening || descriptionGenerating}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={picking || opening || descriptionGenerating}
                      onClick={() => void pickPath()}
                    >
                      <FolderOpen className="size-4" aria-hidden="true" />
                      {t("openRepo.pickButton")}
                    </Button>
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="project-manager-alias">
                    {t("openRepo.aliasLabel")}
                  </FieldLabel>
                  <Input
                    id="project-manager-alias"
                    value={alias}
                    onChange={(event) => handleAliasChange(event.target.value)}
                    placeholder={t("openRepo.aliasPlaceholder")}
                    autoComplete="off"
                    disabled={opening || descriptionGenerating}
                  />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="project-manager-icon">
                      {t("projectManager.projectIcon")}
                    </FieldLabel>
                    <LucideIconPicker
                      id="project-manager-icon"
                      value={projectIcon}
                      onValueChange={setProjectIcon}
                      disabled={opening || descriptionGenerating}
                      {...lucideIconPickerI18n(t)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t("projectManager.workspaceLabel")}</FieldLabel>
                    <WorkspaceSelectMenu
                      value={workspaceId}
                      onChange={setWorkspaceId}
                      ariaLabel={t("projectManager.workspaceLabel")}
                      disabled={opening || descriptionGenerating}
                      triggerClassName="h-9"
                    />
                  </Field>
                </div>

                <ProjectDescriptionField
                  value={description}
                  onChange={setDescription}
                  repoPath={path}
                  disabled={opening}
                  generating={descriptionGenerating}
                  onGeneratingChange={setDescriptionGenerating}
                  fieldId="project-manager-description"
                />
              </FieldGroup>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={!path.trim() || opening || descriptionGenerating}>
                  {opening ? t("common.loading") : t("openRepo.submitButton")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!path.trim() || opening || descriptionGenerating}
                  onClick={() => void saveAndContinue()}
                >
                  {t("openRepo.saveAndContinue")}
                </Button>
              </div>
            </form>
          </ScrollArea>
        ) : null}

        {view === "groups" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-start justify-between gap-4 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">{t("projectManager.groups")}</h2>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                    {t("projectManager.groupsCount", { count: workspaces.length })}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t("projectManager.groupsDescription")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <label className="relative block w-52">
                  <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <Input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    className="h-8 bg-background pr-3 pl-8 text-xs"
                    placeholder={t("repo.filter")}
                    aria-label={t("repo.filter")}
                    disabled={opening || dragging}
                  />
                </label>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="size-8 shrink-0"
                      disabled={opening || dragging}
                      aria-label={t("projectManager.createGroup")}
                      onClick={() => startCreateGroup(null)}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("projectManager.createGroup")}</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleGroupDragStart}
              onDragCancel={() => setActiveDrag(null)}
              onDragEnd={(event) => void handleGroupDragEnd(event)}
            >
              <div className="min-h-0 flex-1">
                {/* -mr-6 让滚动条贴住面板右缘（抵消 section 的 px-6）；pr-3 使行高亮与滚动条留出约 12px 间隔 */}
                <ScrollArea className="-mr-6 h-full pb-4 [&_[data-slot=scroll-area-viewport]>div]:!block">
                  <div className="space-y-0.5 pr-3 pb-4">
                    {/* 最外层根节点：展开/收起全部，并作为拖回未分组的投放目标 */}
                    <RootDropZone>
                      <div className="group/row hover:bg-accent/60 flex h-9 w-full items-center gap-0.5 rounded-md transition-colors">
                        <button
                          type="button"
                          className="focus-visible:ring-ring flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                          onClick={() => setRootExpanded((current) => !current)}
                        >
                          <ChevronDown
                            className={cn(
                              "text-muted-foreground size-3.5 shrink-0 transition-transform",
                              !rootExpanded && "-rotate-90",
                            )}
                            aria-hidden="true"
                          />
                          <Folder
                            className="text-muted-foreground size-4 shrink-0"
                            aria-hidden="true"
                          />
                          {t("projectManager.rootGroup")}
                        </button>
                        <div className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={t("projectManager.createGroup")}
                                disabled={opening || dragging}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={() => startCreateGroup(null)}
                              >
                                <Plus aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("projectManager.createGroup")}</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </RootDropZone>
                    {rootExpanded ? (
                      <SortableContext
                        items={rootMixedItems.map((item) => item.sortableId)}
                        strategy={verticalListSortingStrategy}
                      >
                        {rootMixedItems.map((item) =>
                          item.kind === "workspace"
                            ? renderWorkspace(item.workspace, 1)
                            : renderGroupProject(item.project, 1),
                        )}
                      </SortableContext>
                    ) : null}
                  </div>
                </ScrollArea>
              </div>
              <DragOverlay dropAnimation={null}>
                {activeDrag?.label ? (
                  <div className="bg-popover text-popover-foreground border-border flex h-9 min-w-[14rem] items-center gap-1.5 rounded-md border px-2 shadow-lg">
                    {activeDrag.type === "project" ? (
                      <ProjectIcon
                        name={activeDrag.icon}
                        className="text-muted-foreground size-3.5 shrink-0"
                      />
                    ) : (
                      <>
                        <ChevronDown
                          className="text-muted-foreground size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <Folder
                          className="text-muted-foreground size-4 shrink-0"
                          aria-hidden="true"
                        />
                      </>
                    )}
                    <span className="min-w-0 truncate text-sm font-medium">{activeDrag.label}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
            {groupDialog?.mode === "create" ? (
              <WorkspaceGroupDialog
                open
                mode="create"
                initialParentId={groupDialog.parentId}
                onOpenChange={(open) => {
                  if (!open) {
                    setGroupDialog(null);
                  }
                }}
              />
            ) : null}
            {groupDialog?.mode === "edit" ? (
              <WorkspaceGroupDialog
                open
                mode="edit"
                workspace={groupDialog.workspace}
                onOpenChange={(open) => {
                  if (!open) {
                    setGroupDialog(null);
                  }
                }}
              />
            ) : null}
            <Dialog
              open={Boolean(deleteTarget)}
              onOpenChange={(open) => {
                if (!open && !deleteBusy) {
                  setDeleteTarget(null);
                }
              }}
            >
              <AppDialogContent>
                <DialogHeader>
                  <DialogTitle>{t("projectManager.deleteGroupTitle")}</DialogTitle>
                </DialogHeader>
                <div className="flex gap-3">
                  <TriangleAlert
                    className="text-chart-4 mt-0.5 size-5 shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-foreground text-sm">
                      <Trans
                        i18nKey="projectManager.deleteGroupQuestion"
                        values={{ name: deleteTarget?.name ?? "" }}
                        components={{
                          name: <span className="font-medium" />,
                        }}
                      />
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t("projectManager.deleteGroupHint")}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={deleteBusy}
                    onClick={() => setDeleteTarget(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deleteBusy}
                    onClick={() => void confirmDeleteGroup()}
                  >
                    {deleteBusy ? t("common.loading") : t("projectManager.deleteGroupAction")}
                  </Button>
                </DialogFooter>
              </AppDialogContent>
            </Dialog>
          </div>
        ) : null}
      </section>

      <ExistingProjectDialog
        open={existingProject !== null}
        project={existingProject}
        action="open"
        onOpenChange={(next) => {
          if (!next) {
            setExistingProject(null);
          }
        }}
        onConfirm={(project) => {
          void confirmExistingProject(project);
        }}
      />
    </div>
  );
}
