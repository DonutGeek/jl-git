import { useMemo, useState, type CSSProperties } from "react";
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
  FolderGit2,
  GitBranch as GitBranchIcon,
  GitCompareArrows,
  LayoutDashboard,
  ListTree,
  RotateCcw,
  RotateCw,
  Search,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

import { LocalBranchMenuList } from "@/components/git/LocalBranchMenuList";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConflictOperationGuard } from "@/hooks/useConflictOperationGuard";
import { useWindowChromeLayout } from "@/hooks/useWindowChromeLayout";
import { cn } from "@/lib/utils";

import { systemOpenService } from "@/services/system/system.open";
import { openBranchCompareWindow } from "@/services/window/branchCompareWindow";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import type { GitBranch } from "@/types/git";
import { Project } from "@/types/project";
import { isLocalBranchPublished } from "@/utils/branchPublish";

/**
 * 工具栏默认比较：源=当前分支；目标优先 upstream，其次 origin/<name>，否则自身。
 */
function resolveDefaultCompareTarget(
  branches: readonly GitBranch[],
  currentBranch: string,
): string {
  const local = branches.find(
    (branch) => !branch.isRemote && branch.name === currentBranch,
  );
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

export type RepoMainView = "workspace" | "changes" | "history";

interface RepoToolbarProps {
  project: Project;
  mainView: RepoMainView;
  onMainViewChange: (view: RepoMainView) => void;
}

/** 顶栏标签下方的仓库工具条：仓库 / 视图 / 分支 / 同步 */
export function RepoToolbar({ project, mainView, onMainViewChange }: RepoToolbarProps) {
  const { t } = useTranslation();
  const { os } = useWindowChromeLayout();
  const revealInFileManagerLabel =
    os === "windows"
      ? t("repo.openInExplorer")
      : os === "linux"
        ? t("repo.openInFileManager")
        : t("repo.openInFinder");
  const navigate = useNavigate();

  const projects = useProjectStore((state) => state.projects);
  const openRepositoryTab = useOpenTabsStore((state) => state.openRepositoryTab);

  const status = useRepoStore((state) => state.status);
  const branches = useRepoStore((state) => state.branches);
  const loading = useRepoStore((state) => state.loading);
  const checkout = useRepoStore((state) => state.checkout);
  const fetchRemote = useRepoStore((state) => state.fetch);
  const pullRemote = useRepoStore((state) => state.pull);
  const pushRemote = useRepoStore((state) => state.push);
  const undoCommit = useRepoStore((state) => state.undoCommit);

  const [checkingOut, setCheckingOut] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const { guard: guardWriteOp, dialog: conflictGuardDialog } =
    useConflictOperationGuard();

  const changeCount = useMemo(() => {
    return status?.entries.length ?? 0;
  }, [status?.entries.length]);

  const ahead = status?.ahead ?? 0;
  const localBranches = useMemo(
    () => branches.filter((branch) => !branch.isRemote),
    [branches],
  );
  /** 下拉：本地在上；仅纳入 origin/ 开头的远端；组内按名称排序 */
  const menuBranches = useMemo(() => {
    const byName = (left: GitBranch, right: GitBranch) =>
      left.name.localeCompare(right.name);
    const local = branches.filter((branch) => !branch.isRemote).sort(byName);
    const originRemote = branches
      .filter(
        (branch) => branch.isRemote && branch.name.startsWith("origin/"),
      )
      .sort(byName);
    return [...local, ...originRemote];
  }, [branches]);
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

  const branchLabel = status?.detached
    ? t("repo.detached")
    : (status?.branch ?? t("repo.currentBranch"));

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const aTime = a.lastOpenedAt ?? a.updatedAt;
      const bTime = b.lastOpenedAt ?? b.updatedAt;
      return bTime.localeCompare(aTime);
    });
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const query = projectFilter.trim().toLowerCase();
    if (!query) {
      return sortedProjects;
    }
    return sortedProjects.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.path.toLowerCase().includes(query),
    );
  }, [sortedProjects, projectFilter]);

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
      toast.success(t("repo.checkoutSuccess", { branch: branchName }));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleCheckUpdate(): Promise<void> {
    if (syncBusy) {
      return;
    }

    setFetching(true);
    const toastId = toast.loading(t("repo.checkUpdateStart"));
    try {
      const result = await fetchRemote();
      const seconds = (result.elapsedMs / 1000).toFixed(3);
      toast.success(t("repo.checkUpdateSuccess", { remote: result.remote, seconds }), {
        id: toastId,
      });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    } finally {
      setFetching(false);
    }
  }

  async function handlePull(): Promise<void> {
    if (syncBusy || needsPublish) {
      return;
    }
    if (!guardWriteOp()) {
      return;
    }

    setPulling(true);
    const toastId = toast.loading(t("repo.pullStart"));
    try {
      // 有当前分支时显式 pull origin <branch>，与 ugit 一致；分离头则走 upstream
      const branch = status?.detached ? undefined : (status?.branch ?? undefined);
      const result = await pullRemote({
        remote: "origin",
        branch,
      });
      const seconds = (result.elapsedMs / 1000).toFixed(3);
      if (result.conflict) {
        toast.error(t("repo.pullConflict"), { id: toastId });
      } else {
        toast.success(t("repo.pullSuccess", { remote: result.remote, seconds }), {
          id: toastId,
        });
      }
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    } finally {
      setPulling(false);
    }
  }

  async function handlePush(): Promise<void> {
    if (syncBusy || ahead <= 0) {
      return;
    }

    setPushing(true);
    const toastId = toast.loading(t("repo.pushStart"));
    try {
      const result = await pushRemote();
      const seconds = (result.elapsedMs / 1000).toFixed(3);
      toast.success(t("repo.pushSuccess", { remote: result.remote, seconds }), {
        id: toastId,
      });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    } finally {
      setPushing(false);
    }
  }

  async function handlePublish(): Promise<void> {
    if (syncBusy || !needsPublish || !status?.branch) {
      return;
    }

    setPushing(true);
    const toastId = toast.loading(t("repo.publishStart"));
    try {
      const result = await pushRemote({
        remote: "origin",
        branch: status.branch,
        setUpstream: true,
      });
      const seconds = (result.elapsedMs / 1000).toFixed(3);
      toast.success(t("repo.publishSuccess", { remote: result.remote, seconds }), {
        id: toastId,
      });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    } finally {
      setPushing(false);
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
      const toastId = toast.loading(t("repo.undoCommitStart"));
      try {
        const result = await undoCommit();
        const seconds = (result.elapsedMs / 1000).toFixed(3);
        toast.success(t("repo.undoCommitSuccess", { seconds }), { id: toastId });
      } catch (error) {
        toast.error(toUserMessage(error), { id: toastId });
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

  function handleOpenBranchCompare(): void {
    const currentBranch =
      status?.branch ?? branches.find((branch) => branch.isCurrent)?.name;
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

  return (
    <div
      data-tauri-drag-region
      className="border-border bg-background flex h-11 shrink-0 items-center gap-2 border-b px-2"
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
            className="h-8 w-44 shrink-0 justify-start gap-1.5 px-2"
            style={noDragStyle}
            aria-label={t("repo.switchProject")}
          >
            <FolderGit2 className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
              {project.name}
            </span>
            <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 overflow-hidden p-0">
          {/* 间距对齐历史「用户」筛选 / 分支下拉 */}
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
          <ScrollArea className="max-h-72 [&_[data-slot=scroll-area-scrollbar][data-state=hidden]]:hidden [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full">
            <div className="min-w-0 p-1">
              {filteredProjects.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-center text-xs">
                  {t("repo.switchProjectNoMatch")}
                </p>
              ) : (
                filteredProjects.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    className="flex w-full max-w-full min-w-0 flex-col items-start gap-0.5 overflow-hidden py-2"
                    onSelect={() => {
                      handleSelectProject(item);
                    }}
                  >
                    <div className="flex w-full max-w-full min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {item.name}
                      </span>
                      {item.id === project.id ? (
                        <Check
                          className="size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    <span
                      className="text-muted-foreground block w-full max-w-full min-w-0 truncate text-xs"
                      title={item.path}
                    >
                      {item.path}
                    </span>
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="bg-border h-6 w-px shrink-0" aria-hidden="true" />

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

          return (
            <Button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-1.5 transition-colors",
                isActive
                  ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "text-muted-foreground",
              )}
              onClick={() => onMainViewChange(item.id)}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              <span>{item.label}</span>
              {item.badge != null ? (
                <span className="bg-primary text-primary-foreground ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>

      <div className="bg-border h-6 w-px shrink-0" aria-hidden="true" />

      {/* 分支：固定宽度 + truncate，避免短/长分支名切换时工具栏抖动 */}
      <DropdownMenu open={branchMenuOpen} onOpenChange={setBranchMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="border-border h-8 w-40 shrink-0 justify-start gap-1.5 border px-2.5 shadow-none"
            style={noDragStyle}
            disabled={checkingOut || loading}
            aria-label={t("repo.branchLabel")}
            title={branchLabel}
          >
            <GitBranchIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
              {branchLabel}
            </span>
            <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          // 禁止 Content 原生滚动，滚动交给内部 ScrollArea；p-0 对齐历史用户筛选
          className="w-72 overflow-hidden p-0"
        >
          <LocalBranchMenuList
            branches={menuBranches}
            checkingOut={checkingOut}
            open={branchMenuOpen}
            onCheckout={(branchName) => {
              void handleCheckout(branchName);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 同步：检查更新 / 更新(pull) / 推送（右键：撤销提交） */}
      <div className="flex shrink-0 items-center gap-1" style={noDragStyle}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={syncBusy}
              onClick={() => void handleCheckUpdate()}
            >
              {fetching ? (
                <Spinner className="size-3.5" />
              ) : (
                <RotateCw className="size-3.5" aria-hidden="true" />
              )}
              <span>{t("repo.checkUpdate")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("repo.checkUpdate")}</TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                disabled={syncBusy || needsPublish}
                onClick={() => void handlePull()}
              >
                <ArrowDownToLine
                  className={cn("size-3.5", pulling && "animate-pulse")}
                  aria-hidden="true"
                />
                <span>{t("repo.pull")}</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {needsPublish ? t("repo.pullNeedsPublish") : t("repo.pullHint")}
          </TooltipContent>
        </Tooltip>

        {needsPublish ? null : (
          <ContextMenu>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                {/* disabled 时包一层，保证仍能显示「无可推送」提示 */}
                <span className="inline-flex">
                  <ContextMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="relative h-8 gap-1.5"
                      disabled={syncBusy || ahead <= 0}
                      onClick={() => void handlePush()}
                    >
                      <ArrowUpFromLine
                        className={cn("size-3.5", pushing && "animate-pulse")}
                        aria-hidden="true"
                      />
                      <span>{t("repo.push")}</span>
                      {ahead > 0 ? (
                        <span
                          className="bg-primary text-primary-foreground ml-0.5 inline-flex size-4 items-center justify-center rounded-full text-[10px] leading-none font-semibold"
                          aria-label={t("repo.unpushedCount", { count: ahead })}
                        >
                          {ahead > 99 ? "99+" : ahead}
                        </span>
                      ) : null}
                    </Button>
                  </ContextMenuTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {ahead <= 0
                  ? t("repo.pushNothing")
                  : t("repo.unpushedCount", { count: ahead })}
              </TooltipContent>
            </Tooltip>
            <ContextMenuContent className="min-w-40">
              <ContextMenuItem
                disabled={ahead <= 0}
                onSelect={handleUndoCommit}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {t("repo.undoCommitMenu")}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )}

        {needsPublish ? (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="relative h-8 gap-1.5"
                disabled={syncBusy}
                onClick={() => void handlePublish()}
              >
                <CloudUpload
                  className={cn("size-3.5", pushing && "animate-pulse")}
                  aria-hidden="true"
                />
                <span>{t("repo.publishBranch")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.publishBranchHint")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {/* 右侧：分支比较 + 外部打开 */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5" style={noDragStyle}>
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
      </div>

      {conflictGuardDialog}
    </div>
  );
}
