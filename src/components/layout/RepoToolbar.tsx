import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Clock3,
  CloudUpload,
  FileCode2,
  Folder,
  GitBranch as GitBranchIcon,
  GitCompareArrows,
  Globe,
  LayoutDashboard,
  ListTree,
  MoreHorizontal,
  RotateCw,
  Undo2,
  Search,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

import { DropdownMenuScrollArea } from "@/components/common/DropdownMenuScrollArea";
import { HighlightText } from "@/components/common/HighlightText";
import { TruncateStartPath } from "@/components/common/TruncateStartPath";
import { LocalBranchMenuList } from "@/components/git/LocalBranchMenuList";
import type { SyncPendingKind } from "@/components/git/SyncPendingWorkspaceOverlay";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { WorkspaceGroupNameBadge } from "@/components/project/WorkspaceGroupNameBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBranchContextActions } from "@/hooks/useBranchContextActions";
import { useShortcutAction } from "@/hooks/useShortcutAction";
import { useWindowChromeLayout } from "@/hooks/useWindowChromeLayout";
import { cn } from "@/lib/utils";

import { openPrimaryRemoteInBrowser } from "@/services/git";
import { systemOpenService } from "@/services/system/system.open";
import { openBranchCompareWindow } from "@/services/window/branchCompareWindow";
import { useAppPrefsStore } from "@/store/useAppPrefsStore";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import type { GitBranch } from "@/types/git";
import type { Project } from "@/types/project";
import { isLocalBranchPublished } from "@/utils/branchPublish";
import {
  CONTEXT_MENU_ITEM_HIGHLIGHT_CLASS,
  useContextMenuOpen,
} from "@/utils/contextMenuHighlight";
import { isPushRejectedError, toastPushError } from "@/utils/gitPushError";
import { revealInFileManagerLabel as revealInFileManagerLabelForOs } from "@/utils/platformLabels";
import {
  filterProjectsForQuickSwitcher,
  sortProjectsForQuickSwitcher,
} from "@/utils/repositoryQuickSwitcher";
import { resolveRepoToolbarDensity, type RepoToolbarDensity } from "@/utils/repoToolbarDensity";

/**
 * 工具栏默认比较：源=当前分支；目标优先 upstream，其次 origin/<name>，否则自身。
 */
function resolveDefaultCompareTarget(
  branches: readonly GitBranch[],
  currentBranch: string,
): string {
  const local = branches.find((branch) => !branch.isRemote && branch.name === currentBranch);
  const upstream = local?.upstream?.trim() ?? "";
  if (upstream) {
    return upstream;
  }
  const originTwin = `origin/${currentBranch}`;
  if (branches.some((branch) => branch.isRemote && branch.name === originTwin)) {
    return originTwin;
  }
  return currentBranch;
}

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;
const EMPTY_BRANCHES: GitBranch[] = [];

export type RepoMainView = "workspace" | "changes" | "history";

interface RepoToolbarProps {
  project: Project;
  mainView: RepoMainView;
  onMainViewChange: (view: RepoMainView) => void;
  loadingShell?: boolean;
}

/** 顶栏标签下方的仓库工具条：仓库 / 视图 / 分支 / 同步 */
export function RepoToolbar({
  project,
  mainView,
  onMainViewChange,
  loadingShell = false,
}: RepoToolbarProps) {
  const { t } = useTranslation();
  const { os, isMacOverlay } = useWindowChromeLayout();
  const dragProps = isMacOverlay ? ({ "data-tauri-drag-region": true } as const) : {};
  const revealInFileManagerLabel = revealInFileManagerLabelForOs(os, t);
  const navigate = useNavigate();

  const projects = useProjectStore((state) => state.projects);
  const workspaces = useProjectStore((state) => state.workspaces);
  const openRepositoryTab = useOpenTabsStore((state) => state.openRepositoryTab);
  const pullStrategy = useAppPrefsStore((state) => state.pullStrategy);
  const setPullStrategy = useAppPrefsStore((state) => state.setPullStrategy);

  const status = useRepoStore((state) => (loadingShell ? null : state.status));
  const branches = useRepoStore((state) => (loadingShell ? EMPTY_BRANCHES : state.branches));
  const loading = useRepoStore((state) => loadingShell || state.loading);
  const checkout = useRepoStore((state) => state.checkout);
  const fetchRemote = useRepoStore((state) => state.fetch);
  const pullRemote = useRepoStore((state) => state.pull);
  const pushRemote = useRepoStore((state) => state.push);
  const undoCommit = useRepoStore((state) => state.undoCommit);
  const syncPendingKind = useRepoStore((state) => state.syncPendingKind);
  const openSyncPendingPreview = useRepoStore((state) => state.openSyncPendingPreview);
  const closeSyncPendingPreview = useRepoStore((state) => state.closeSyncPendingPreview);

  const [checkingOut, setCheckingOut] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const { menuOpen: pushContextMenuOpen, onOpenChange: onPushContextMenuOpenChange } =
    useContextMenuOpen();
  const [projectFilter, setProjectFilter] = useState("");
  const [density, setDensity] = useState<RepoToolbarDensity>("comfortable");
  const {
    contextActions: baseBranchContextActions,
    dialogs: branchContextDialogs,
    conflictGuard: guardWriteOp,
  } = useBranchContextActions({
    // Dialog 挂在工具栏层，先关下拉避免焦点与卸载冲突
    onBeforeDialog: () => setBranchMenuOpen(false),
  });

  const toolbarRef = useRef<HTMLDivElement>(null);
  const densityRef = useRef<RepoToolbarDensity>(density);
  densityRef.current = density;
  const projectPathRef = useRef(project.path);
  projectPathRef.current = project.path;

  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) {
      return;
    }

    const update = (): void => {
      const next = resolveRepoToolbarDensity(element.clientWidth, densityRef.current);
      if (next !== densityRef.current) {
        densityRef.current = next;
        setDensity(next);
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // 收紧顺序：先右侧工具进 ⋯，再缩左侧文案 / 仓库名 / 分支名
  const collapseSideTools = density !== "comfortable";
  const iconOnly = density === "minimal";

  // 切仓时丢掉上一仓的本地 busy，避免新仓工具栏误显示「正在推送」
  useEffect(() => {
    setCheckingOut(false);
    setFetching(false);
    setPulling(false);
    setPushing(false);
    setBranchMenuOpen(false);
  }, [project.path]);

  // 同步进行中关闭分支菜单，避免禁用后菜单仍挂着
  useEffect(() => {
    if (fetching || pulling || pushing || loading) {
      setBranchMenuOpen(false);
    }
  }, [fetching, pulling, pushing, loading]);

  const changeCount = useMemo(() => {
    return status?.entries.length ?? 0;
  }, [status?.entries.length]);

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;

  function toggleSyncPending(next: SyncPendingKind, event: SyntheticEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (syncPendingKind === next) {
      closeSyncPendingPreview();
      return;
    }
    openSyncPendingPreview(next);
  }
  const localBranches = useMemo(() => branches.filter((branch) => !branch.isRemote), [branches]);
  // 当前检出分支尚未发布到远端时，在「推送」右侧显示「发布分支」
  const needsPublish = useMemo(() => {
    if (!status?.branch || status.detached) {
      return false;
    }
    const current = localBranches.find((branch) => branch.name === status.branch);
    if (!current) {
      return !status.upstream;
    }
    return !isLocalBranchPublished(current, branches);
  }, [branches, localBranches, status?.branch, status?.detached, status?.upstream]);
  const syncBusy = fetching || pulling || pushing || loading;
  /** 推送/拉取等同步中只禁用分支切换，勿用 Spinner 冒充加载 */
  const branchSwitchLocked = checkingOut || syncBusy;

  const branchLabel = status?.detached
    ? t("repo.detached")
    : (status?.branch ?? t("repo.currentBranch"));

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
    () => filterProjectsForQuickSwitcher(sortedProjects, projectFilter, workspaceNameById),
    [projectFilter, sortedProjects, workspaceNameById],
  );

  function handleSelectProject(next: Project): void {
    if (next.id === project.id) {
      return;
    }
    // 先导航立刻切换标签高亮；数据加载由 RepoPage 完成
    openRepositoryTab(next.id);
    navigate(`/repo/${next.id}`);
  }

  async function handleCheckout(branchName: string): Promise<void> {
    if (branchName === status?.branch) {
      return;
    }
    if (!guardWriteOp()) {
      return;
    }

    setCheckingOut(true);
    try {
      await checkout(branchName);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setCheckingOut(false);
    }
  }

  const branchContextActions = {
    ...baseBranchContextActions,
    onCheckout: (branch: GitBranch) => {
      setBranchMenuOpen(false);
      void handleCheckout(branch.name);
    },
  };

  async function handleCheckUpdate(): Promise<void> {
    if (syncBusy) {
      return;
    }

    setFetching(true);
    try {
      await fetchRemote();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setFetching(false);
    }
  }

  async function handlePull(options?: { rebase?: boolean }): Promise<void> {
    if (syncBusy || needsPublish) {
      return;
    }
    if (!guardWriteOp()) {
      return;
    }

    const rebase = options?.rebase ?? pullStrategy === "rebase";
    setPulling(true);
    try {
      // 有当前分支时显式 pull origin <branch>，与 ugit 一致；分离头则走 upstream
      const branch = status?.detached ? undefined : (status?.branch ?? undefined);
      const result = await pullRemote({
        remote: "origin",
        branch,
        rebase,
      });
      if (result.conflict) {
        toast.error(t("repo.pullConflict"));
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setPulling(false);
    }
  }

  async function handlePush(): Promise<void> {
    if (syncBusy || ahead <= 0) {
      return;
    }

    const originPath = project.path;
    const originBranch = status?.detached ? undefined : (status?.branch ?? undefined);
    setPushing(true);
    try {
      const result = await pushRemote({
        repoPath: originPath,
        remote: "origin",
        branch: originBranch,
      });
      const seconds = (result.elapsedMs / 1000).toFixed(1);
      toast.success(t("repo.pushSuccess", { remote: result.remote, seconds }));
    } catch (error) {
      const stillOnOrigin = useRepoStore.getState().repoPath === originPath;
      toastPushError(error, {
        onUpdate: stillOnOrigin ? () => void handlePull() : undefined,
      });
      // 静默 fetch，刷新 behind 角标，便于用户直接点「更新」
      if (isPushRejectedError(error) && stillOnOrigin) {
        void fetchRemote().catch(() => undefined);
      }
    } finally {
      if (projectPathRef.current === originPath) {
        setPushing(false);
      }
    }
  }

  useShortcutAction("pull", handlePull, !loadingShell);
  useShortcutAction("push", handlePush, !loadingShell);

  async function handlePublish(): Promise<void> {
    if (syncBusy || !needsPublish || !status?.branch) {
      return;
    }

    const originPath = project.path;
    const originBranch = status.branch;
    setPushing(true);
    try {
      const result = await pushRemote({
        repoPath: originPath,
        remote: "origin",
        branch: originBranch,
        setUpstream: true,
      });
      const seconds = (result.elapsedMs / 1000).toFixed(1);
      toast.success(t("repo.publishSuccess", { remote: result.remote, seconds }));
    } catch (error) {
      const stillOnOrigin = useRepoStore.getState().repoPath === originPath;
      toastPushError(error, {
        onUpdate: stillOnOrigin ? () => void handlePull() : undefined,
      });
      if (isPushRejectedError(error) && stillOnOrigin) {
        void fetchRemote().catch(() => undefined);
      }
    } finally {
      if (projectPathRef.current === originPath) {
        setPushing(false);
      }
    }
  }

  function handleUndoCommit(): void {
    if (syncBusy || ahead <= 0) {
      toast.message(t("repo.errors.nothingToUndo"));
      return;
    }
    if (!guardWriteOp()) {
      return;
    }
    void (async () => {
      try {
        await undoCommit();
      } catch (error) {
        toast.error(toUserMessage(error));
      }
    })();
  }

  async function handleOpenInEditor(): Promise<void> {
    try {
      await systemOpenService.openInEditor(project.path);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handleRevealInFinder(): Promise<void> {
    try {
      await systemOpenService.revealInFileManager(project.path);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handleOpenInTerminal(): Promise<void> {
    try {
      await systemOpenService.openTerminal(project.path);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handleOpenRemoteInBrowser(): Promise<void> {
    try {
      const result = await openPrimaryRemoteInBrowser(project.path);
      if (result === "empty") {
        toast.message(t("repo.tabCopyRemoteEmpty"));
        return;
      }
      if (result === "unsupported") {
        toast.error(t("repo.openRemoteUnsupported"));
        return;
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  function handleOpenBranchCompare(): void {
    const currentBranch = status?.branch ?? branches.find((branch) => branch.isCurrent)?.name;
    if (!currentBranch) {
      toast.error(t("repo.openBranchCompareNoBranch"));
      return;
    }
    void openBranchCompareWindow({
      projectId: project.id,
      mode: "branch",
      base: currentBranch,
      target: resolveDefaultCompareTarget(branches, currentBranch),
    }).catch((error: unknown) => {
      toast.error(toUserMessage(error) || t("agent.compareBranchesFailed"));
    });
  }

  const viewItems: Array<{
    id: RepoMainView;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }> = [
    { id: "workspace", label: t("repo.viewWorkspace"), icon: LayoutDashboard },
    {
      id: "changes",
      label: t("repo.viewChanges"),
      icon: ListTree,
      badge: changeCount > 0 ? changeCount : undefined,
    },
    { id: "history", label: t("repo.viewHistory"), icon: Clock3 },
  ];

  const branchSwitchButton = (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "border-border h-8 shrink-0 justify-start border shadow-none",
        // 收紧时仍留窄文案槽，避免只剩图标看不出当前分支
        iconOnly ? "w-[6.5rem] gap-1 px-2" : "w-40 gap-1.5 px-2.5",
      )}
      style={noDragStyle}
      data-repo-git-control="branch-switch"
      disabled={branchSwitchLocked}
      aria-busy={checkingOut}
      aria-label={`${t("repo.branchLabel")}: ${branchLabel}`}
      title={branchLabel}
    >
      {checkingOut ? (
        <Spinner className="size-3.5 shrink-0" />
      ) : (
        <GitBranchIcon className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      <TruncateStartPath
        path={branchLabel}
        className="min-w-0 flex-1 text-sm font-medium"
        title=""
      />
      <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
    </Button>
  );

  return (
    <div
      ref={toolbarRef}
      {...dragProps}
      className="border-border bg-background flex h-11 shrink-0 items-center gap-2 border-b px-2"
      data-repo-toolbar-density={density}
      data-repo-toolbar-loading-shell={loadingShell || undefined}
    >
      {/* 仓库切换 */}
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) {
            setProjectFilter("");
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={cn("h-8 shrink-0 justify-start gap-1.5 px-2", iconOnly ? "w-28" : "w-44")}
            style={noDragStyle}
            aria-label={t("repo.switchProject")}
            title={project.name}
          >
            <ProjectIcon name={project.icon} className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
              {project.name}
            </span>
            <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80 overflow-hidden p-0">
          {/* 间距对齐历史「用户」筛选 / 分支下拉；行样式对齐全局仓库搜索 */}
          <div className="border-border border-b p-1.5">
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                placeholder={t("repo.switchProjectFilter")}
                className="h-7 pl-7 text-xs shadow-none"
                aria-label={t("repo.switchProjectFilter")}
                autoFocus
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              />
            </div>
          </div>
          <DropdownMenuScrollArea
            itemCount={filteredProjects.length}
            itemHeight={56}
            maxHeight={288}
            availableHeightOffset={41}
          >
            {/* 与分支下拉一致：左右对称内边距 */}
            <div className="min-w-0 px-2 py-1">
              {filteredProjects.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-center text-xs">
                  {t("repo.switchProjectNoMatch")}
                </p>
              ) : (
                filteredProjects.map((item) => {
                  const workspace = item.workspaceId
                    ? workspaceById.get(item.workspaceId)
                    : undefined;
                  return (
                    <DropdownMenuItem
                      key={item.id}
                      className="flex w-full max-w-full min-w-0 items-start gap-2.5 overflow-hidden rounded-md px-1.5 py-2"
                      onSelect={() => {
                        handleSelectProject(item);
                      }}
                    >
                      <ProjectIcon
                        name={item.icon}
                        className="mt-0.5 size-3.5 shrink-0 self-start"
                      />
                      <span className="flex min-w-0 flex-1 flex-col items-stretch gap-0.5 overflow-hidden text-left">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <HighlightText
                            text={item.name}
                            query={projectFilter}
                            className="min-w-0 truncate text-sm font-medium"
                          />
                          {workspace ? <WorkspaceGroupNameBadge workspace={workspace} /> : null}
                          {item.id === project.id ? (
                            <Check className="ml-auto size-3.5 shrink-0" aria-hidden="true" />
                          ) : null}
                        </span>
                        <HighlightText
                          text={item.path}
                          query={projectFilter}
                          title={item.path}
                          className="text-muted-foreground block w-full truncate text-xs"
                        />
                      </span>
                    </DropdownMenuItem>
                  );
                })
              )}
            </div>
          </DropdownMenuScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 主视图切换 */}
      <div
        className="flex items-center gap-0.5"
        role="tablist"
        aria-label={t("repo.mainViews")}
        style={noDragStyle}
      >
        {viewItems.map((item) => {
          const Icon = item.icon;
          const isActive = mainView === item.id;

          const button = (
            <Button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={item.label}
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 transition-colors",
                iconOnly ? "gap-1 px-2" : "gap-1.5",
                isActive
                  ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "text-muted-foreground",
              )}
              onClick={() => onMainViewChange(item.id)}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {iconOnly ? null : <span>{item.label}</span>}
              {item.badge != null ? (
                <span className="bg-primary text-primary-foreground ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Button>
          );

          if (!iconOnly) {
            return <Fragment key={item.id}>{button}</Fragment>;
          }

          return (
            <Tooltip key={item.id} delayDuration={300}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent>{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* 分支：宽档 w-40；收紧时窄槽仍 truncate 露出名称，全文 Tooltip */}
      <DropdownMenu
        open={branchMenuOpen}
        onOpenChange={(open) => {
          if (open && branchSwitchLocked) {
            return;
          }
          setBranchMenuOpen(open);
        }}
      >
        {iconOnly ? (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <DropdownMenuTrigger asChild>{branchSwitchButton}</DropdownMenuTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent>{branchLabel}</TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuTrigger asChild>{branchSwitchButton}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent
          align="start"
          // 禁止 Content 原生滚动，滚动交给内部 ScrollArea；p-0 对齐历史用户筛选
          className="w-72 overflow-hidden p-0"
          // 右键菜单挂在 Portal，点菜单项时勿关掉分支下拉
          onPointerDownOutside={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest('[data-slot="context-menu-content"]')) {
              event.preventDefault();
            }
          }}
          onFocusOutside={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest('[data-slot="context-menu-content"]')) {
              event.preventDefault();
            }
          }}
        >
          <LocalBranchMenuList
            branches={branches}
            checkingOut={checkingOut}
            open={branchMenuOpen}
            aheadCount={ahead}
            contextActions={branchContextActions}
            onCheckout={(branchName) => {
              setBranchMenuOpen(false);
              void handleCheckout(branchName);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 同步：检查更新 / 更新(pull) / 推送；有角标时「操作 + 数字」用 ButtonGroup 组合 */}
      <div className="flex shrink-0 items-center gap-1" style={noDragStyle}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("h-8 shadow-none", iconOnly ? "px-2" : "gap-1.5")}
              data-repo-git-control="fetch"
              disabled={syncBusy}
              aria-label={t("repo.checkUpdate")}
              onClick={() => void handleCheckUpdate()}
            >
              {fetching ? (
                <Spinner className="size-3.5" />
              ) : (
                <RotateCw className="size-3.5" aria-hidden="true" />
              )}
              {iconOnly ? null : <span>{t("repo.checkUpdate")}</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("repo.checkUpdate")}</TooltipContent>
        </Tooltip>

        <ButtonGroup
          aria-label={t("repo.pull")}
          className={cn(
            // Tooltip / Dropdown 外包层会挡住默认 [&>*] 接缝
            "[&_button]:rounded-none [&_button]:shadow-none",
            "[&>:first-child_button]:rounded-l-md [&>button:first-child]:rounded-l-md",
            "[&>button:last-child]:rounded-r-md [&>:last-child_button]:rounded-r-md",
            "[&>:not(:first-child)_button]:border-l-0 [&>button:not(:first-child)]:border-l-0",
          )}
        >
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn("h-8 shadow-none", iconOnly ? "gap-1 px-2" : "gap-1.5")}
                  data-repo-git-control="pull"
                  disabled={syncBusy || needsPublish}
                  aria-label={t("repo.pull")}
                  onClick={() => void handlePull()}
                >
                  {pulling ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <ArrowDownToLine className="size-3.5" aria-hidden="true" />
                  )}
                  {iconOnly ? null : <span>{t("repo.pull")}</span>}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {needsPublish
                ? t("repo.pullNeedsPublish")
                : pullStrategy === "rebase"
                  ? t("repo.pullRebaseHint")
                  : t("repo.pullHint")}
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="h-8 w-7"
                      disabled={syncBusy}
                      aria-label={t("repo.pullMenu")}
                    >
                      <ChevronDown className="size-3.5" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("repo.pullMenu")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="min-w-52">
              {/* 顶部只放「非默认」的一次更新，与常见 Git 客户端一致 */}
              {pullStrategy === "rebase" ? (
                <DropdownMenuItem
                  disabled={syncBusy || needsPublish}
                  onSelect={() => {
                    void handlePull({ rebase: false });
                  }}
                >
                  <ArrowDownToLine className="size-3.5" aria-hidden="true" />
                  {t("repo.pullMerge")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled={syncBusy || needsPublish}
                  onSelect={() => {
                    void handlePull({ rebase: true });
                  }}
                >
                  <ArrowDownToLine className="size-3.5" aria-hidden="true" />
                  {t("repo.pullRebase")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={pullStrategy === "merge"}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setPullStrategy("merge");
                  }
                }}
              >
                <ArrowDownToLine className="size-3.5" aria-hidden="true" />
                {t("repo.pullStrategyMerge")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={pullStrategy === "rebase"}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setPullStrategy("rebase");
                  }
                }}
              >
                <ArrowDownToLine className="size-3.5" aria-hidden="true" />
                {t("repo.pullStrategyRebase")}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {behind > 0 ? (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 px-1.5 shadow-none",
                      syncPendingKind === "pull" && "bg-accent",
                    )}
                    disabled={syncBusy}
                    aria-label={t("repo.unpulledCount", { count: behind })}
                    aria-pressed={syncPendingKind === "pull"}
                    onClick={(event) => toggleSyncPending("pull", event)}
                  >
                    <Badge className="min-w-4 justify-center rounded-full px-1 py-0 text-[10px] leading-4 font-semibold tabular-nums">
                      {behind > 99 ? "99+" : behind}
                    </Badge>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("repo.unpulledCount", { count: behind })}</TooltipContent>
            </Tooltip>
          ) : null}
        </ButtonGroup>

        {needsPublish ? (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("h-8 shadow-none", iconOnly ? "px-2" : "gap-1.5")}
                disabled={syncBusy}
                aria-label={t("repo.publishBranch")}
                onClick={() => void handlePublish()}
              >
                {pushing ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <CloudUpload className="size-3.5" aria-hidden="true" />
                )}
                {iconOnly ? null : <span>{t("repo.publishBranch")}</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.publishBranchHint")}</TooltipContent>
          </Tooltip>
        ) : ahead > 0 ? (
          <ButtonGroup
            aria-label={t("repo.push")}
            className={cn(
              // Tooltip / Dropdown 外包层会挡住默认 [&>*] 接缝
              "[&_button]:rounded-none [&_button]:shadow-none",
              "[&>:first-child_button]:rounded-l-md [&>button:first-child]:rounded-l-md",
              "[&>button:last-child]:rounded-r-md [&>:last-child_button]:rounded-r-md",
              "[&>:not(:first-child)_button]:border-l-0 [&>button:not(:first-child)]:border-l-0",
            )}
          >
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn("h-8 shadow-none", iconOnly ? "gap-1 px-2" : "gap-1.5")}
                  data-repo-git-control="push"
                  disabled={syncBusy}
                  aria-label={t("repo.push")}
                  onClick={() => void handlePush()}
                >
                  {pushing ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <ArrowUpFromLine className="size-3.5" aria-hidden="true" />
                  )}
                  {iconOnly ? null : <span>{t("repo.push")}</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.push")}</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="h-8 w-7"
                        disabled={syncBusy}
                        aria-label={t("repo.pushMenu")}
                      >
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("repo.pushMenu")}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="min-w-40">
                <DropdownMenuItem disabled={syncBusy} onSelect={handleUndoCommit}>
                  <Undo2 className="size-3.5" aria-hidden="true" />
                  {t("repo.undoCommitMenu")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 px-1.5 shadow-none",
                      syncPendingKind === "push" && "bg-accent",
                    )}
                    disabled={syncBusy}
                    aria-label={t("repo.unpushedCount", { count: ahead })}
                    aria-pressed={syncPendingKind === "push"}
                    onClick={(event) => toggleSyncPending("push", event)}
                  >
                    <Badge className="min-w-4 justify-center rounded-full px-1 py-0 text-[10px] leading-4 font-semibold tabular-nums">
                      {ahead > 99 ? "99+" : ahead}
                    </Badge>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("repo.unpushedCount", { count: ahead })}</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        ) : (
          <ContextMenu onOpenChange={onPushContextMenuOpenChange}>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                {/* disabled 时包一层，保证仍能显示「无可推送」提示 */}
                <span className="inline-flex">
                  <ContextMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 shadow-none",
                        iconOnly ? "gap-1 px-2" : "gap-1.5",
                        pushContextMenuOpen && CONTEXT_MENU_ITEM_HIGHLIGHT_CLASS,
                      )}
                      data-repo-git-control="push"
                      disabled={syncBusy || ahead <= 0}
                      aria-label={t("repo.push")}
                      onClick={() => void handlePush()}
                    >
                      {pushing ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <ArrowUpFromLine className="size-3.5" aria-hidden="true" />
                      )}
                      {iconOnly ? null : <span>{t("repo.push")}</span>}
                    </Button>
                  </ContextMenuTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("repo.pushNothing")}</TooltipContent>
            </Tooltip>
            <ContextMenuContent className="min-w-40">
              <ContextMenuItem disabled={ahead <= 0} onSelect={handleUndoCommit}>
                <Undo2 className="size-3.5" aria-hidden="true" />
                {t("repo.undoCommitMenu")}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )}
      </div>

      {/* 右侧：分支比较 + 外部打开；minimal 时收进 ⋯ */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5" style={noDragStyle}>
        {collapseSideTools ? (
          <DropdownMenu>
            {/* Tooltip 包在 span 上，避免悬停时焦点环贴在按钮上像「描边」 */}
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={t("repo.moreTools")}
                    >
                      <MoreHorizontal className="size-3.5" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("repo.moreTools")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem onSelect={() => void handleOpenInEditor()}>
                <FileCode2 className="size-3.5" aria-hidden="true" />
                {t("repo.openInEditor")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleOpenBranchCompare}>
                <GitCompareArrows className="size-3.5" aria-hidden="true" />
                {t("repo.openBranchCompare")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleRevealInFinder()}>
                <Folder className="size-3.5" aria-hidden="true" />
                {revealInFileManagerLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleOpenInTerminal()}>
                <Terminal className="size-3.5" aria-hidden="true" />
                {t("repo.openInTerminal")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleOpenRemoteInBrowser()}>
                <Globe className="size-3.5" aria-hidden="true" />
                {t("repo.openRemoteInBrowser")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("repo.openInEditor")}
                  onClick={() => void handleOpenInEditor()}
                >
                  <FileCode2 className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.openInEditor")}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("repo.openBranchCompare")}
                  onClick={handleOpenBranchCompare}
                >
                  <GitCompareArrows className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.openBranchCompare")}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={revealInFileManagerLabel}
                  onClick={() => void handleRevealInFinder()}
                >
                  <Folder className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{revealInFileManagerLabel}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("repo.openInTerminal")}
                  onClick={() => void handleOpenInTerminal()}
                >
                  <Terminal className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.openInTerminal")}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("repo.openRemoteInBrowser")}
                  onClick={() => void handleOpenRemoteInBrowser()}
                >
                  <Globe className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.openRemoteInBrowser")}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {branchContextDialogs}
    </div>
  );
}
