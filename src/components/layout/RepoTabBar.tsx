import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
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
import { FolderPlus, Plus } from "lucide-react";
import { toast } from "sonner";

import { MultiAgentWindowButton } from "@/components/agent/MultiAgentWindowButton";
import { RepositoryTabGroup } from "@/components/layout/RepoTabGroup";
import {
  readRepoTabDragData,
  RepoTabChrome,
  SortableRepoTab,
  type TabDisplayItem,
} from "@/components/layout/RepoTabItem";
import { OpenRepoDialog } from "@/components/project/OpenRepoDialog";
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
import { useOpenTabsStore, type OpenTab } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { gitService } from "@/services/git";
import { pickPrimaryRemoteUrl } from "@/services/git/git.remote";
import { copyToClipboard } from "@/utils/clipboard";
import { cn } from "@/lib/utils";
import { groupRepoTabs, resolveRepoTabDropAction } from "@/utils/repoTabGroups";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";

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
  const setPendingActiveId = useOpenTabsStore((state) => state.setPendingActiveId);
  const setLastActiveTabId = useOpenTabsStore((state) => state.setLastActiveTabId);
  const projects = useProjectStore((state) => state.projects);
  const workspaces = useProjectStore((state) => state.workspaces);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadWorkspaces = useProjectStore((state) => state.loadWorkspaces);
  const removeProject = useProjectStore((state) => state.removeProject);
  const updateAlias = useProjectStore((state) => state.updateAlias);
  const updateProject = useProjectStore((state) => state.updateProject);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [aliasTarget, setAliasTarget] = useState<Project | null>(null);
  const [aliasValue, setAliasValue] = useState("");
  const [aliasBusy, setAliasBusy] = useState(false);
  const navigationFrameRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const routedActiveId = resolveActiveTabId(location.pathname, tabEntries);
  /** 点击态优先：标签先响应，路由与仓库数据随后以低优先级落地。 */
  const activeId =
    pendingActiveId && tabEntries.some((tab) => tab.id === pendingActiveId)
      ? pendingActiveId
      : routedActiveId;
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
    if (pendingActiveId && routedActiveId === pendingActiveId) {
      setPendingActiveId(null);
    }
  }, [pendingActiveId, routedActiveId, setPendingActiveId]);

  useEffect(
    () => () => {
      if (navigationFrameRef.current !== null) {
        window.cancelAnimationFrame(navigationFrameRef.current);
      }
      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
      }
    },
    [],
  );

  // 同步上次激活标签，供冷启动「恢复上次」使用。
  // 根路径 `/` 只是冷启动占位：resolveActiveTabId 会把「新标签」当成高亮，
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

  // 点击标签或从别处跳转时，把激活标签滚入可见区域（含冷启动恢复）
  useEffect(() => {
    if (!activeId || !tabScrollViewport) {
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      const activeEl = tabScrollViewport.querySelector<HTMLElement>('[aria-current="page"]');
      activeEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeId, tabScrollViewport, tabEntries]);

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
    return groups.sort((left, right) => {
      if (left.workspaceId === undefined) {
        return -1;
      }
      if (right.workspaceId === undefined) {
        return 1;
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

  /** 标签高亮为紧急更新，路由与仓库大树放入 Transition。 */
  function activateTab(tabId: string): void {
    if (navigationFrameRef.current !== null) {
      window.cancelAnimationFrame(navigationFrameRef.current);
    }
    if (navigationTimerRef.current !== null) {
      window.clearTimeout(navigationTimerRef.current);
    }
    setPendingActiveId(tabId);
    navigationFrameRef.current = window.requestAnimationFrame(() => {
      navigationFrameRef.current = null;
      navigationTimerRef.current = window.setTimeout(() => {
        navigationTimerRef.current = null;
        startTransition(() => navigateToTab(tabId));
      }, 0);
    });
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

  async function handleTabDragEnd(event: DragEndEvent): Promise<void> {
    setDraggingId(null);
    const activeData = readRepoTabDragData(event.active.data.current);
    const overData = readRepoTabDragData(event.over?.data.current);
    if (!activeData || activeData.type !== "tab") {
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

    if (action !== "ungroup" || !activeData.projectId) {
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

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(event: DragStartEvent) => setDraggingId(String(event.active.id))}
        onDragEnd={(event: DragEndEvent) => void handleTabDragEnd(event)}
        onDragCancel={() => setDraggingId(null)}
      >
        <header
          {...dragProps}
          className={cn(
            // 底边线用绝对定位伪元素绘制，不占布局高度：
            // 保证内容盒高度=h-12(48px)，与滚动内容 h-12 完全一致，从根上消除 1px 纵向溢出
            "bg-muted/40 relative flex h-12 shrink-0 items-center pr-0",
            "after:bg-border after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:content-['']",
            headerPaddingClass,
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
          <div className="flex h-full min-w-0 items-center gap-1" style={noDragStyle}>
            {/* 主滚动用 shadcn ScrollArea：细滚动条、悬停/滚动时才显示，不再用裸 overflow-x-auto */}
            {/* 内容 h-12 与视口高度一致（表头已去掉占位边框），纵向不溢出，无需隐藏纵向滚动条 */}
            <ScrollArea ref={bindScrollArea} className="h-full min-w-0">
              <div className="flex h-12 w-max items-center gap-1.5">
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
          <div {...dragProps} className="h-full min-w-8 flex-1" />
          <div className="flex h-7 shrink-0 items-center pr-3" style={noDragStyle}>
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
            <RepoTabChrome tab={draggingTab} isActive={draggingTab.id === activeId} dragging />
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
