import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { MultiAgentWindowButton } from "@/components/agent/MultiAgentWindowButton";
import {
  REPO_TAB_CONTENT_CLASSNAME,
  REPO_TAB_SCROLL_AREA_CLASSNAME,
  REPO_TAB_SCROLL_FADE_PX,
  resolveRepoTabWheelDelta,
  scrollHorizontallyIntoView,
} from "@/components/layout/repoLoadingLayout";
import { RepoTabGroupChrome, RepositoryTabGroup } from "@/components/layout/RepoTabGroup";
import {
  readRepoTabDragData,
  RepoTabChrome,
  SortableRepoTab,
  type TabDisplayItem,
} from "@/components/layout/RepoTabItem";
import { Button } from "@/components/ui/button";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { useWindowChromeLayout } from "@/hooks/useWindowChromeLayout";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { gitService } from "@/services/git";
import { pickPrimaryRemoteUrl } from "@/services/git/git.remote";
import { copyToClipboard } from "@/utils/clipboard";
import { cn } from "@/lib/utils";
import {
  resolveActiveOpenTab,
  resolveRoutedTabId,
  shouldClearPendingActivation,
} from "@/utils/repoTabActivation";
import { beginRepoTabSwitchMeasure } from "@/utils/repoTabPerformance";
import {
  groupRepoTabs,
  reorderNamedGroupIds,
  resolveRepoTabDropAction,
  resolveWorkspaceGroupSortOrders,
} from "@/utils/repoTabGroups";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

/** 仓库标签顶栏（Win/Linux 用系统窗口按钮，不再挂自绘三键） */
export function RepoTabBar() {
  const { t } = useTranslation();
  const { headerPaddingClass, isMacOverlay } = useWindowChromeLayout();
  const dragProps = isMacOverlay ? ({ "data-tauri-drag-region": true } as const) : {};
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
  const orderTabs = useOpenTabsStore((state) => state.orderTabs);
  const pruneTabs = useOpenTabsStore((state) => state.pruneTabs);
  const pendingActiveId = useOpenTabsStore((state) => state.pendingActiveId);
  const pendingOriginLocationKey = useOpenTabsStore((state) => state.pendingOriginLocationKey);
  const setPendingActiveId = useOpenTabsStore((state) => state.setPendingActiveId);
  const setLastActiveTabId = useOpenTabsStore((state) => state.setLastActiveTabId);
  const projects = useProjectStore((state) => state.projects);
  const workspaces = useProjectStore((state) => state.workspaces);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadWorkspaces = useProjectStore((state) => state.loadWorkspaces);
  const removeProject = useProjectStore((state) => state.removeProject);
  const updateAlias = useProjectStore((state) => state.updateAlias);
  const updateProject = useProjectStore((state) => state.updateProject);
  const reorderGroupedItems = useProjectStore((state) => state.reorderGroupedItems);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingGroupWorkspaceId, setDraggingGroupWorkspaceId] = useState<string | null>(null);
  const [aliasTarget, setAliasTarget] = useState<Project | null>(null);
  const [aliasValue, setAliasValue] = useState("");
  const [aliasBusy, setAliasBusy] = useState(false);
  const [optimisticActiveId, setOptimisticActiveId] = useState<string | null>(null);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);
  const pendingActivationStale = shouldClearPendingActivation({
    pendingActiveId,
    originLocationKey: pendingOriginLocationKey,
    currentLocationKey: location.key,
  });
  const effectivePendingActiveId = pendingActivationStale ? null : pendingActiveId;
  const routedActiveId = resolveRoutedTabId(location.pathname, tabEntries);
  const resolvedActiveId =
    resolveActiveOpenTab(location.pathname, tabEntries, effectivePendingActiveId)?.id ?? null;
  const activeId = optimisticActiveId ?? resolvedActiveId;
  const { viewport: tabScrollViewport, bindScrollArea } = useScrollAreaViewport();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const labels = useMemo(
    () => ({
      close: t("repo.tabClose"),
      remove: t("repo.tabRemove"),
      closeMore: t("repo.tabCloseMore"),
      closeOthers: t("repo.tabCloseOthers"),
      closeLeft: t("repo.tabCloseLeft"),
      closeRight: t("repo.tabCloseRight"),
      setAlias: t("repo.tabSetAlias"),
      copy: t("common.copy"),
      copyRemote: t("repo.tabCopyRemote"),
      copyPath: t("repo.tabCopyPath"),
    }),
    [t],
  );

  useEffect(() => {
    const tasks: Promise<unknown>[] = [];
    if (projects.length === 0) {
      tasks.push(loadProjects());
    }
    if (workspaces.length === 0) {
      tasks.push(loadWorkspaces());
    }
    if (tasks.length > 0) {
      void Promise.all(tasks).catch((error: unknown) => {
        console.warn("[RepoTabBar] load project groups failed", error);
      });
    }
  }, [loadProjects, loadWorkspaces, projects.length, workspaces.length]);

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

  useEffect(() => {
    if ((pendingActiveId && routedActiveId === pendingActiveId) || pendingActivationStale) {
      setPendingActiveId(null);
    }
  }, [pendingActivationStale, pendingActiveId, routedActiveId, setPendingActiveId]);

  useEffect(() => {
    if (
      optimisticActiveId &&
      (routedActiveId === optimisticActiveId ||
        !tabEntries.some((tab) => tab.id === optimisticActiveId))
    ) {
      setOptimisticActiveId(null);
    }
  }, [optimisticActiveId, routedActiveId, tabEntries]);

  // 同步上次激活标签，供冷启动「恢复上次」使用。
  // 根路径 `/` 只是冷启动占位：resolveRoutedTabId 会把「新标签」当成高亮，
  // 若此时写入 lastActive，会覆盖已持久化的仓库标签，导致下次总进新标签页。
  useEffect(() => {
    if (location.pathname === "/") {
      return;
    }
    if (!activeId || !tabEntries.some((tab) => tab.id === activeId)) {
      return;
    }
    setLastActiveTabId(activeId);
  }, [activeId, location.pathname, setLastActiveTabId, tabEntries]);

  // 点击标签或从别处跳转时，把激活标签滚入可见区域（预留左右渐隐，含冷启动恢复）
  useEffect(() => {
    if (!activeId || !tabScrollViewport) {
      return;
    }
    let cancelled = false;
    let innerRaf = 0;
    const outerRaf = window.requestAnimationFrame(() => {
      // 双 rAF：等标签激活样式与分组布局落稳后再量位置
      innerRaf = window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        const activeEl = tabScrollViewport.querySelector<HTMLElement>(
          `[data-repo-tab-id="${CSS.escape(activeId)}"]`,
        );
        if (!activeEl) {
          return;
        }
        scrollHorizontallyIntoView(tabScrollViewport, activeEl, REPO_TAB_SCROLL_FADE_PX);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outerRaf);
      window.cancelAnimationFrame(innerRaf);
    };
  }, [activeId, tabScrollViewport, tabEntries]);

  useEffect(() => {
    if (!tabScrollViewport) {
      setCanScrollTabsLeft(false);
      setCanScrollTabsRight(false);
      return;
    }

    const updateScrollEdges = (): void => {
      const maxScrollLeft = Math.max(
        0,
        tabScrollViewport.scrollWidth - tabScrollViewport.clientWidth,
      );
      setCanScrollTabsLeft(tabScrollViewport.scrollLeft > 1);
      setCanScrollTabsRight(tabScrollViewport.scrollLeft < maxScrollLeft - 1);
    };
    const content = tabScrollViewport.firstElementChild;
    const resizeObserver = new ResizeObserver(updateScrollEdges);
    resizeObserver.observe(tabScrollViewport);
    if (content instanceof HTMLElement) {
      resizeObserver.observe(content);
    }
    tabScrollViewport.addEventListener("scroll", updateScrollEdges, { passive: true });
    const raf = window.requestAnimationFrame(updateScrollEdges);

    return () => {
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      tabScrollViewport.removeEventListener("scroll", updateScrollEdges);
    };
  }, [tabScrollViewport]);

  useEffect(() => {
    if (!tabScrollViewport) {
      return;
    }
    const handleWheel = (event: WheelEvent): void => {
      const delta = resolveRepoTabWheelDelta({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        hasOverflow: tabScrollViewport.scrollWidth > tabScrollViewport.clientWidth,
      });
      if (delta === 0) {
        return;
      }
      const previousScrollLeft = tabScrollViewport.scrollLeft;
      tabScrollViewport.scrollLeft += delta;
      if (tabScrollViewport.scrollLeft !== previousScrollLeft) {
        event.preventDefault();
      }
    };

    tabScrollViewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => tabScrollViewport.removeEventListener("wheel", handleWheel);
  }, [tabScrollViewport]);

  const tabs = useMemo(() => {
    const byId = new Map(projects.map((project) => [project.id, project]));
    return tabEntries.flatMap((tab): TabDisplayItem[] => {
      if (tab.type === "new-tab") {
        return [
          {
            id: tab.id,
            label: t("repo.newTab"),
            title: t("repo.newTab"),
            type: tab.type,
            workspaceId: undefined,
          },
        ];
      }
      const project = byId.get(tab.projectId);
      return project
        ? [
            {
              id: tab.id,
              label: project.name,
              title: project.path,
              type: tab.type,
              workspaceId: project.workspaceId,
              project,
            },
          ]
        : [];
    });
  }, [projects, t, tabEntries]);

  const workspaceById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );

  const tabGroups = useMemo(() => {
    const groups = groupRepoTabs(
      tabs.map((tab) => ({
        workspaceId: tab.workspaceId,
        value: tab,
      })),
    );
    const workspaceRank = new Map(
      [...workspaces]
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"),
        )
        .map((workspace, index) => [workspace.id, index]),
    );
    // 命名组 → 未分组 → 新标签页（紧挨右侧 +，避免点加号却出现在最左侧）
    return groups.sort((left, right) => {
      if (left.workspaceId === undefined) {
        return 1;
      }
      if (right.workspaceId === undefined) {
        return -1;
      }
      if (left.workspaceId === null) {
        return 1;
      }
      if (right.workspaceId === null) {
        return -1;
      }
      return (
        (workspaceRank.get(left.workspaceId) ?? Number.MAX_SAFE_INTEGER) -
        (workspaceRank.get(right.workspaceId) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  }, [tabs, workspaces]);

  const orderedTabIds = useMemo(
    () => tabGroups.flatMap((group) => group.values.map((tab) => tab.id)),
    [tabGroups],
  );
  const orderedTabIdsKey = orderedTabIds.join("\0");

  useEffect(() => {
    orderTabs(orderedTabIds);
  }, [orderTabs, orderedTabIds, orderedTabIdsKey]);

  const draggingTab = useMemo(
    () => tabs.find((tab) => tab.id === draggingId) ?? null,
    [draggingId, tabs],
  );
  const draggingGroupWorkspace = useMemo(
    () => (draggingGroupWorkspaceId ? (workspaceById.get(draggingGroupWorkspaceId) ?? null) : null),
    [draggingGroupWorkspaceId, workspaceById],
  );
  const isDraggingAnything = Boolean(draggingId || draggingGroupWorkspaceId);

  /** 路由只负责切壳；仓库数据由 RepoPage 后台加载。 */
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

  /** 同步提交激活意图与路由；工作区首帧只渲染目标仓库轻量壳。 */
  function activateTab(tabId: string): void {
    const target = useOpenTabsStore.getState().tabs.find((tab) => tab.id === tabId);
    if (target?.type === "repository") {
      beginRepoTabSwitchMeasure(target.projectId);
    }
    // 先独立提交标签视觉态；随后全局激活才触发 WorkspaceHost 与 RepoPage。
    flushSync(() => {
      setOptimisticActiveId(tabId);
    });
    setPendingActiveId(tabId, location.key);
    navigateToTab(tabId);
  }

  function syncRouteAfterTabsChange(preferredId?: string): void {
    const remaining = useOpenTabsStore.getState().tabs;
    if (activeId && remaining.some((tab) => tab.id === activeId)) {
      return;
    }
    const next = remaining.find((tab) => tab.id === preferredId) ?? remaining[0];
    if (next) {
      activateTab(next.id);
      return;
    }
    const newTabId = openNewTab();
    activateTab(newTabId);
  }

  function handleSelect(tabId: string): void {
    if (tabId === activeId) {
      return;
    }
    activateTab(tabId);
  }

  function closeOneTab(tabId: string): void {
    const nextId = closeTab(tabId);
    if (tabId === activeId) {
      if (nextId) {
        activateTab(nextId);
      } else {
        const newTabId = openNewTab();
        activateTab(newTabId);
      }
    }
  }

  function closeGroupTabs(workspaceId: string): void {
    const groupTabIds = tabs
      .filter((tab) => tab.type === "repository" && tab.workspaceId === workspaceId)
      .map((tab) => tab.id);
    if (groupTabIds.length === 0) {
      toast.message(t("projectManager.closeGroupEmpty"));
      return;
    }
    const closingActive = Boolean(activeId && groupTabIds.includes(activeId));
    let nextId: string | null = null;
    for (const tabId of groupTabIds) {
      nextId = closeTab(tabId);
    }
    if (closingActive) {
      if (nextId) {
        activateTab(nextId);
      } else {
        activateTab(openNewTab());
      }
    }
    toast.success(t("projectManager.closeGroupSuccess", { count: groupTabIds.length }));
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

  function clearDragState(): void {
    setDraggingId(null);
    setDraggingGroupWorkspaceId(null);
  }

  async function handleGroupDragEnd(event: DragEndEvent): Promise<void> {
    const activeData = readRepoTabDragData(event.active.data.current);
    const overData = readRepoTabDragData(event.over?.data.current);
    if (!activeData || activeData.type !== "group") {
      return;
    }
    if (typeof activeData.workspaceId !== "string") {
      return;
    }
    if (workspaceById.get(activeData.workspaceId)?.locked) {
      toast.error(t("projectManager.lockedGroupDragBlocked"));
      return;
    }
    const overWorkspaceId = overData?.workspaceId;
    if (typeof overWorkspaceId !== "string" || overWorkspaceId === activeData.workspaceId) {
      return;
    }

    const namedIds = tabGroups
      .map((group) => group.workspaceId)
      .filter((id): id is string => typeof id === "string");
    const nextIds = reorderNamedGroupIds(namedIds, activeData.workspaceId, overWorkspaceId);
    if (!nextIds) {
      return;
    }

    const workspaceOrders = resolveWorkspaceGroupSortOrders({
      orderedWorkspaceIds: nextIds,
      workspaces,
    });

    try {
      await reorderGroupedItems({
        workspaces: workspaceOrders,
        projects: [],
      });
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handleTabDragEnd(event: DragEndEvent): Promise<void> {
    clearDragState();
    const activeData = readRepoTabDragData(event.active.data.current);
    const overData = readRepoTabDragData(event.over?.data.current);
    if (!activeData) {
      return;
    }

    if (activeData.type === "group") {
      await handleGroupDragEnd(event);
      return;
    }

    if (activeData.type !== "tab") {
      return;
    }

    const action = resolveRepoTabDropAction({
      activeWorkspaceId: activeData.workspaceId,
      overWorkspaceId: overData?.workspaceId,
      hasOverTarget: Boolean(event.over && overData),
      overIsTab: overData?.type === "tab",
    });

    if (action === "reorder" && event.over) {
      reorderTabs(String(event.active.id), String(event.over.id));
      return;
    }

    if (
      action === "join-group" &&
      activeData.projectId &&
      typeof overData?.workspaceId === "string"
    ) {
      const sourceLocked =
        typeof activeData.workspaceId === "string" &&
        Boolean(workspaceById.get(activeData.workspaceId)?.locked);
      const targetLocked = Boolean(workspaceById.get(overData.workspaceId)?.locked);
      if (sourceLocked || targetLocked) {
        toast.error(t("projectManager.lockedGroupMoveBlocked"));
        return;
      }
      if (event.over && overData.type === "tab") {
        reorderTabs(String(event.active.id), String(event.over.id));
      }
      try {
        await updateProject({
          id: activeData.projectId,
          workspaceId: overData.workspaceId,
        });
      } catch (error) {
        toast.error(toUserMessage(error));
      }
      return;
    }

    if (action !== "ungroup" || !activeData.projectId) {
      return;
    }

    if (
      typeof activeData.workspaceId === "string" &&
      workspaceById.get(activeData.workspaceId)?.locked
    ) {
      toast.error(t("projectManager.lockedGroupMoveBlocked"));
      return;
    }

    if (event.over && overData?.type === "tab" && overData.workspaceId === null) {
      reorderTabs(String(event.active.id), String(event.over.id));
    }

    try {
      await updateProject({
        id: activeData.projectId,
        workspaceId: null,
      });
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  function handleDragStart(event: DragStartEvent): void {
    const data = readRepoTabDragData(event.active.data.current);
    if (data?.type === "group" && typeof data.workspaceId === "string") {
      setDraggingGroupWorkspaceId(data.workspaceId);
      setDraggingId(null);
      return;
    }
    if (data?.type === "tab") {
      setDraggingId(String(event.active.id));
      setDraggingGroupWorkspaceId(null);
    }
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={(event: DragEndEvent) => void handleTabDragEnd(event)}
        onDragCancel={clearDragState}
      >
        <header
          {...dragProps}
          className={cn(
            // 底边线用绝对定位伪元素绘制，不占布局高度：
            // 保证内容盒高度=h-12(48px)，与滚动内容 h-12 完全一致，从根上消除 1px 纵向溢出
            // isolate + after:z-20：压过分组壳 / 滚动淡出层，避免底边被遮住
            "bg-muted/40 relative isolate flex h-12 shrink-0 items-center overflow-hidden pr-0",
            "after:bg-border after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-20 after:h-px after:content-['']",
            headerPaddingClass,
            isDraggingAnything ? "z-60" : "z-40",
          )}
        >
          {/* 新建标签固定在左侧；标签滚动区内的其余空白保留为窗口拖拽面。 */}
          {/* mr-2：与首个分组壳拉开间隔（勿用仅内边距，易被滚动区视觉「吃掉」） */}
          <div className="mr-2 flex h-7 shrink-0 items-center" style={noDragStyle}>
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
                    activateTab(tabId);
                  }}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.addTab")}</TooltipContent>
            </Tooltip>
          </div>
          {/* 标签区吃满右侧鲸灵按钮前的空间。 */}
          <div className="flex h-full min-w-0 flex-1 items-center">
            {/* 主滚动用 shadcn ScrollArea：细滚动条、悬停/滚动时才显示，不再用裸 overflow-x-auto */}
            {/* pb-px：分组壳底边不压住 header 底部分隔线 */}
            {/* 空白滚动区是标题栏拖拽面；实际标签内容单独标记 no-drag，保留点击与排序。 */}
            <div {...dragProps} className="relative h-full min-w-0 flex-1 pb-px">
              <ScrollArea ref={bindScrollArea} className={REPO_TAB_SCROLL_AREA_CLASSNAME}>
                <div className={REPO_TAB_CONTENT_CLASSNAME} style={noDragStyle}>
                  {tabGroups.map((group) => (
                    <RepositoryTabGroup
                      key={group.key}
                      workspaceId={group.workspaceId}
                      workspace={
                        typeof group.workspaceId === "string"
                          ? workspaceById.get(group.workspaceId)
                          : undefined
                      }
                      tabIds={group.values.map((tab) => tab.id)}
                      ungroupedLabel={t("projectManager.ungrouped")}
                      isGroupDragging={
                        typeof group.workspaceId === "string" &&
                        group.workspaceId === draggingGroupWorkspaceId
                      }
                      onCloseGroup={closeGroupTabs}
                    >
                      {group.values.map((tab) => (
                        <SortableRepoTab
                          key={tab.id}
                          tab={tab}
                          isActive={tab.id === activeId}
                          tabIndex={orderedTabIds.indexOf(tab.id)}
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
                    </RepositoryTabGroup>
                  ))}
                </div>
              </ScrollArea>
              {/* 左右渐隐：宽度与 REPO_TAB_SCROLL_FADE_PX 对齐；底色贴合 header bg-muted/40 */}
              <div
                className={cn(
                  "pointer-events-none absolute top-0 bottom-px left-0 z-10 w-10 bg-linear-to-r from-[color-mix(in_oklab,var(--muted)_40%,var(--background))] from-15% to-transparent transition-opacity duration-150",
                  canScrollTabsLeft ? "opacity-100" : "opacity-0",
                )}
                aria-hidden="true"
              />
              <div
                className={cn(
                  "pointer-events-none absolute top-0 right-0 bottom-px z-10 w-10 bg-linear-to-l from-[color-mix(in_oklab,var(--muted)_40%,var(--background))] from-15% to-transparent transition-opacity duration-150",
                  canScrollTabsRight ? "opacity-100" : "opacity-0",
                )}
                aria-hidden="true"
              />
            </div>
          </div>
          {/* 窄拖拽缝：窗口拖动仍可用，又不拉开标签与右侧按钮 */}
          <div {...dragProps} className="h-full w-1.5 shrink-0" />
          <div className="flex h-7 shrink-0 items-center pr-2" style={noDragStyle}>
            <MultiAgentWindowButton
              label={t("multiAgent.openButton")}
              className="size-7 shrink-0"
              iconClassName="size-4"
              tooltipSide="bottom"
            />
          </div>
        </header>
        <DragOverlay dropAnimation={null} style={{ zIndex: 100 }}>
          {draggingTab ? (
            <RepoTabChrome
              tab={draggingTab}
              isActive={draggingTab.id === activeId}
              dragging
              dragBorderColor={(() => {
                if (typeof draggingTab.workspaceId !== "string") {
                  return undefined;
                }
                return workspaceById.get(draggingTab.workspaceId)?.color;
              })()}
            />
          ) : draggingGroupWorkspace ? (
            <RepoTabGroupChrome workspace={draggingGroupWorkspace} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>
      <Dialog
        open={Boolean(aliasTarget)}
        onOpenChange={(open) => {
          if (!open && !aliasBusy) {
            setAliasTarget(null);
          }
        }}
      >
        <AppDialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t("repo.tabAliasTitle")}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void submitAlias(event)}>
            <Field>
              <FieldLabel className="sr-only" htmlFor="repository-tab-alias">
                {t("repo.tabAliasTitle")}
              </FieldLabel>
              <Input
                id="repository-tab-alias"
                value={aliasValue}
                onChange={(event) => setAliasValue(event.target.value)}
                placeholder={t("openRepo.aliasPlaceholder")}
                autoFocus
                disabled={aliasBusy}
              />
            </Field>
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
                  aliasBusy || !aliasValue.trim() || aliasValue.trim() === aliasTarget?.name
                }
              >
                {aliasBusy ? <Spinner className="size-3.5" /> : null}
                {t("repo.tabAliasSave")}
              </Button>
            </DialogFooter>
          </form>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
