import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { BranchList } from "@/components/git/BranchList";
import { ChangesPanelLoadingShell } from "@/components/git/ChangesPanelLoadingShell";
import { CommitBox } from "@/components/git/CommitBox";
import { CommitFileDiffWorkspaceOverlay } from "@/components/git/CommitFileDiffWorkspaceOverlay";
import type { SidebarView } from "@/components/layout/ActivityBar";
import { RepoLoadingIndicator } from "@/components/layout/RepoLoadingIndicator";
import { RepoLoadingWorkspace } from "@/components/layout/RepoLoadingWorkspace";
import type { RepoMainView } from "@/components/layout/RepoToolbar";
import { RepoWorkspaceLayout } from "@/components/layout/RepoWorkspaceLayout";
import { ResizableSplit } from "@/components/layout/ResizableSplit";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import { useWindowChromeLayout } from "@/hooks/useWindowChromeLayout";

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

import { useProjectStore } from "@/store/useProjectStore";
import { useRepoNavStore } from "@/store/useRepoNavStore";
import {
  hasRepoSession,
  restoreRepoSession,
  restoreRepoSessionHistory,
  beginRepoSwitch,
  useRepoStore,
} from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { DEFAULT_PROJECT_ICON, type Project } from "@/types/project";
import { resolveRepoBootstrapMode, shouldShowRepoLoadingShell } from "@/utils/repoPageBootstrap";
import { finishRepoTabSwitchMeasure } from "@/utils/repoTabPerformance";

/** 变更列表在纵向分栏中的最小高度。 */
const CHANGES_LIST_MIN_HEIGHT_PX = 320;
/** 变更列（相对 Diff 预览）最小 / 默认宽度相关。 */
const CHANGES_PANEL_MIN_WIDTH_PX = 240;
const CHANGES_PANEL_DEFAULT_RATIO = 26;
const HISTORY_DETAIL_SPLIT_KEY = "jlgit:split:history-detail";

/** 项目元数据尚未进 store 时，用占位驱动分区加载壳（避免整页「正在打开仓库」） */
function createRepoBootstrapStub(projectId: string): Project {
  const now = new Date(0).toISOString();
  return {
    id: projectId,
    workspaceId: null,
    name: "",
    description: null,
    icon: DEFAULT_PROJECT_ICON,
    path: projectId,
    lastOpenedAt: null,
    pinned: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

const LazyAgentChatPanel = lazy(() =>
  import("@/components/ai/AgentChatPanel").then((module) => ({
    default: module.AgentChatPanel,
  })),
);
const LazyFileTree = lazy(() =>
  import("@/components/git/FileTree").then((module) => ({ default: module.FileTree })),
);
const LazyChangesPanel = lazy(() =>
  import("@/components/git/ChangesPanel").then((module) => ({
    default: module.ChangesPanel,
  })),
);
const LazyChangesPreviewPane = lazy(() =>
  import("@/components/git/ChangesPreviewPane").then((module) => ({
    default: module.ChangesPreviewPane,
  })),
);
const LazyTagList = lazy(() =>
  import("@/components/git/TagList").then((module) => ({ default: module.TagList })),
);
const LazyHistoryWorkspace = lazy(() =>
  import("@/components/git/HistoryWorkspace").then((module) => ({
    default: module.HistoryWorkspace,
  })),
);
const LazyWorkspaceBrowser = lazy(() =>
  import("@/components/git/WorkspaceBrowser").then((module) => ({
    default: module.WorkspaceBrowser,
  })),
);

function RepoModuleLoading() {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground flex h-full min-h-24 items-center justify-center gap-2 text-xs">
      <Spinner className="size-3.5" />
      <span>{t("common.loading")}</span>
    </div>
  );
}

function ChangesPreviewLoading() {
  const { t } = useTranslation();
  return <RepoLoadingIndicator area="preview" label={t("common.loading")} />;
}

/** 从 store 同步取项目元数据（轻量，不含 Git 会话还原） */
function lookupProject(projectId: string | undefined): Project | null {
  if (!projectId) {
    return null;
  }
  return useProjectStore.getState().findById(projectId) ?? null;
}

// 清理带 :vN / -vN 的旧 localStorage key（现已改用稳定名 + 读时校验）
const LEGACY_STORAGE_KEY_PREFIXES = [
  "jlgit:split:history-detail",
  "jlgit:split:changes-preview",
  "jlgit:split:changes-commit",
  "jlgit:split:branch-compare-files",
  "jlgit:history-graph-width",
  "jlgit:history-view-prefs",
] as const;
const CURRENT_STORAGE_KEYS = new Set([
  HISTORY_DETAIL_SPLIT_KEY,
  "jlgit:split:changes-preview",
  "jlgit:split:changes-commit",
  "jlgit:split:branch-compare-files",
  "jlgit:history-graph-width",
  "jlgit:history-view-prefs",
]);
try {
  for (const key of Object.keys(localStorage)) {
    const isLegacyPrefixed = LEGACY_STORAGE_KEY_PREFIXES.some(
      (prefix) => key === prefix || key.startsWith(`${prefix}:`) || key.startsWith(`${prefix}-`),
    );
    if (isLegacyPrefixed && !CURRENT_STORAGE_KEYS.has(key)) {
      localStorage.removeItem(key);
    }
  }
} catch {
  // ignore
}

interface RepoPageProps {
  projectId: string;
  /** 为 false 时保活隐藏：不请求、不抢 focus 刷新 */
  active: boolean;
}

interface RepoPageLoadError {
  projectId: string;
  message: string;
}

export function RepoPage({ projectId, active }: RepoPageProps) {
  const { t } = useTranslation();
  const { isMacOverlay } = useWindowChromeLayout();
  const dragProps = isMacOverlay ? ({ "data-tauri-drag-region": true } as const) : {};

  const project = useProjectStore(
    (state) => state.projects.find((item) => item.id === projectId) ?? null,
  );
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const openExisting = useProjectStore((state) => state.openExisting);
  const loadAll = useRepoStore((state) => state.loadAll);
  const refreshStatus = useRepoStore((state) => state.refreshStatus);
  const reset = useRepoStore((state) => state.reset);
  const activeRepoPath = useRepoStore((state) => state.repoPath);
  const conflictFocusEpoch = useRepoStore((state) => state.conflictFocusEpoch);
  const fileTreeReveal = useRepoNavStore((state) => state.fileTreeReveal);

  const [readyRepoPath, setReadyRepoPath] = useState<string | null>(() => {
    const initialProject = lookupProject(projectId);
    if (
      initialProject &&
      useRepoStore.getState().repoPath === initialProject.path &&
      hasRepoSession(initialProject.path)
    ) {
      return initialProject.path;
    }
    return null;
  });
  const [loadError, setLoadError] = useState<RepoPageLoadError | null>(null);
  const [bootstrapEpoch, setBootstrapEpoch] = useState(0);
  const [sidebarView, setSidebarView] = useState<SidebarView>("branches");
  const [mainView, setMainView] = useState<RepoMainView>("changes");
  const mainViewRef = useRef(mainView);
  mainViewRef.current = mainView;
  const hasApiKey = useHasAgentApiKey();
  const error = loadError?.projectId === projectId ? loadError.message : null;
  const bootstrapping = project
    ? shouldShowRepoLoadingShell({
        targetPath: project.path,
        activeStorePath: activeRepoPath,
        readyRepoPath,
      })
    : !error;

  // 无 API Key 时不可停留在鲸灵侧栏
  useEffect(() => {
    if (!hasApiKey && sidebarView === "agent") {
      setSidebarView("branches");
    }
  }, [hasApiKey, sidebarView]);

  // 变更右键「在仓库目录树中显示」：切到目录树侧栏
  useEffect(() => {
    if (!fileTreeReveal) {
      return;
    }
    setSidebarView("files");
  }, [fileTreeReveal]);

  const workspacePreview = useRepoNavStore((state) => state.workspacePreview);

  // 活动栏切换时静默刷新对应数据（目录树靠重新挂载拉取）
  const prevSidebarViewRef = useRef<SidebarView | null>(null);
  useEffect(() => {
    if (!active || !project || bootstrapping) {
      return;
    }
    const prev = prevSidebarViewRef.current;
    prevSidebarViewRef.current = sidebarView;
    if (prev === null || prev === sidebarView) {
      return;
    }
    if (sidebarView === "branches") {
      void useRepoStore
        .getState()
        .refreshBranches()
        .catch((refreshError: unknown) => {
          console.warn("[RepoPage] refreshBranches on sidebar switch failed", refreshError);
        });
      return;
    }
    if (sidebarView === "tags") {
      void useRepoStore
        .getState()
        .refreshTags()
        .catch((refreshError: unknown) => {
          console.warn("[RepoPage] refreshTags on sidebar switch failed", refreshError);
        });
    }
  }, [active, bootstrapping, project, sidebarView]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // 合并/拉取冲突后自动切到变更视图
  useEffect(() => {
    if (conflictFocusEpoch <= 0 || !active) {
      return;
    }
    setMainView("changes");
  }, [active, conflictFocusEpoch]);

  useEffect(() => {
    if (!active || !projectId) {
      return;
    }

    const id = projectId;
    let cancelled = false;

    let hydrationFrame: number | null = null;
    let historyFrame: number | null = null;
    // 双 rAF 给目标仓库轻量壳一次独立绘制机会，再恢复大型会话或拉取 Git。
    const shellFrame = window.requestAnimationFrame(() => {
      hydrationFrame = window.requestAnimationFrame(() => {
        const metric = finishRepoTabSwitchMeasure(id);
        if (metric && import.meta.env.DEV) {
          console.debug(
            `[performance] repo tab shell painted in ${metric.durationMs.toFixed(1)}ms`,
          );
        }
        void (async () => {
          setLoadError(null);

          try {
            let target = useProjectStore.getState().findById(id);

            if (!target) {
              await loadProjects();
              target = useProjectStore.getState().findById(id);
            }

            if (!target) {
              throw new Error(t("repo.notFound"));
            }

            if (cancelled) {
              return;
            }

            const cacheHit = hasRepoSession(target.path);
            const mode = resolveRepoBootstrapMode({
              targetPath: target.path,
              activeStorePath: useRepoStore.getState().repoPath,
              hasCachedSession: cacheHit,
            });

            if (mode === "restore-cache") {
              restoreRepoSession(target.path, {
                deferHistory: mainViewRef.current !== "history",
              });
            } else if (mode === "load") {
              beginRepoSwitch(target.path, true);
            }

            void openExisting(target.id).catch((touchError) => {
              console.warn("[RepoPage] touchOpened failed", touchError);
            });

            if (mode === "load") {
              await loadAll(target.path);
              if (!cancelled) {
                setReadyRepoPath(target.path);
              }
              return;
            }

            setReadyRepoPath(target.path);
            if (mode === "restore-cache" && mainViewRef.current !== "history") {
              const restoredPath = target.path;
              historyFrame = window.requestAnimationFrame(() => {
                restoreRepoSessionHistory(restoredPath);
              });
            }
            const hydrated = useRepoStore.getState();
            const canSoftRefresh =
              hydrated.repoPath === target.path && hydrated.branches.length > 0;

            if (canSoftRefresh) {
              void refreshStatus().catch((refreshError) => {
                console.warn("[RepoPage] refreshStatus failed", refreshError);
              });
              return;
            }

            await loadAll(target.path);
          } catch (initError) {
            if (!cancelled) {
              const message = toUserMessage(initError);
              setLoadError({ projectId: id, message });
              toast.error(message);
            }
          }
        })();
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(shellFrame);
      if (hydrationFrame !== null) {
        window.cancelAnimationFrame(hydrationFrame);
      }
      if (historyFrame !== null) {
        window.cancelAnimationFrame(historyFrame);
      }
    };
  }, [active, bootstrapEpoch, loadAll, loadProjects, openExisting, projectId, refreshStatus]);

  useEffect(() => {
    if (!active || !project || bootstrapping) {
      return;
    }

    let refreshing = false;
    let refreshFrame: number | null = null;

    const refreshChanges = async (): Promise<void> => {
      if (refreshing) {
        return;
      }

      refreshing = true;
      try {
        await refreshStatus();
      } catch (refreshError) {
        // 自动刷新失败不打断当前操作；手动刷新仍会给出可见提示。
        console.warn("[RepoPage] refresh repository status failed", refreshError);
      } finally {
        refreshing = false;
      }
    };

    const scheduleRefresh = (): void => {
      if (refreshFrame !== null || document.visibilityState !== "visible") {
        return;
      }
      // 后台恢复先给 WebView 两帧完成合成，再触发 Git/React 更新；focus + visibility 只合并为一次。
      refreshFrame = window.requestAnimationFrame(() => {
        refreshFrame = window.requestAnimationFrame(() => {
          refreshFrame = null;
          void refreshChanges();
        });
      });
    };

    const handleWindowFocus = (): void => {
      scheduleRefresh();
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (refreshFrame !== null) {
        window.cancelAnimationFrame(refreshFrame);
      }
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [active, bootstrapping, project, refreshStatus]);

  function handleMainViewChange(view: RepoMainView): void {
    setMainView(view);
  }

  // 目录树点击文件：切到工作区并打开预览
  useEffect(() => {
    if (!workspacePreview) {
      return;
    }
    handleMainViewChange("workspace");
  }, [workspacePreview]);

  // 引导期一律用分区壳 + 小加载；禁止整页「正在打开仓库…」
  if (bootstrapping && !error) {
    const shellProject = project ?? createRepoBootstrapStub(projectId);
    return (
      <RepoLoadingWorkspace
        project={shellProject}
        sidebarView={sidebarView}
        mainView={mainView}
        label={t("common.loading")}
        onSidebarViewChange={setSidebarView}
        onMainViewChange={handleMainViewChange}
      />
    );
  }

  if (error || !project) {
    return (
      <section {...dragProps} className="flex h-full flex-col">
        <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-destructive text-sm" role="alert">
            {error ?? t("repo.notFound")}
          </p>
          <div className="flex items-center gap-2" style={noDragStyle}>
            {project ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => {
                  setLoadError(null);
                  setBootstrapEpoch((epoch) => epoch + 1);
                }}
              >
                {t("repo.refresh")}
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link to="/">{t("common.back")}</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const sidebar = (
    <aside data-jlgit-sidebar="" className="h-full min-h-0 overflow-hidden">
      {sidebarView === "files" ? (
        <Suspense fallback={<RepoModuleLoading />}>
          <LazyFileTree key={project.path} repoPath={project.path} />
        </Suspense>
      ) : null}
      {sidebarView === "branches" ? <BranchList key={project.path} /> : null}
      {sidebarView === "tags" ? (
        <Suspense fallback={<RepoModuleLoading />}>
          <LazyTagList key={project.path} onSelectTag={() => handleMainViewChange("history")} />
        </Suspense>
      ) : null}
      {sidebarView === "agent" ? (
        <Suspense fallback={<RepoModuleLoading />}>
          <LazyAgentChatPanel projectId={project.id} repoPath={project.path} />
        </Suspense>
      ) : null}
    </aside>
  );

  const workspacePane = (
    <Suspense fallback={<RepoModuleLoading />}>
      <LazyWorkspaceBrowser
        key={project.path}
        repoPath={project.path}
        repoName={project.name}
        active={mainView === "workspace"}
      />
    </Suspense>
  );

  const changesPane = (
    <ResizableSplit
      orientation="horizontal"
      defaultRatio={CHANGES_PANEL_DEFAULT_RATIO}
      minFirstPx={CHANGES_PANEL_MIN_WIDTH_PX}
      minSecondPx={280}
      storageKey="jlgit:split:changes-preview"
      first={
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
          <ResizableSplit
            orientation="vertical"
            defaultRatio={65}
            minFirstPx={CHANGES_LIST_MIN_HEIGHT_PX}
            // 提交区：勾选 + 信息框 + 提交按钮 + 可选「已提交」条，不可再压扁
            minSecondPx={200}
            storageKey="jlgit:split:changes-commit"
            first={
              <div className="h-full min-h-0 overflow-hidden">
                <Suspense fallback={<ChangesPanelLoadingShell />}>
                  <LazyChangesPanel key={project.path} />
                </Suspense>
              </div>
            }
            second={
              <div className="h-full min-h-0 overflow-hidden">
                <CommitBox key={project.path} />
              </div>
            }
          />
        </section>
      }
      second={
        <aside className="h-full min-h-0 overflow-hidden">
          <Suspense fallback={<ChangesPreviewLoading />}>
            <LazyChangesPreviewPane key={project.path} />
          </Suspense>
        </aside>
      }
    />
  );

  const historyPane = (
    <Suspense fallback={<RepoModuleLoading />}>
      <LazyHistoryWorkspace key={project.path} fileDiffCover="workspace" />
    </Suspense>
  );

  const activeMainPane =
    mainView === "workspace" ? workspacePane : mainView === "history" ? historyPane : changesPane;

  return (
    <RepoWorkspaceLayout
      project={project}
      sidebarView={sidebarView}
      mainView={mainView}
      sidebar={sidebar}
      main={<div className="h-full min-h-0 min-w-0 overflow-hidden">{activeMainPane}</div>}
      coverOverlay={mainView === "history" ? <CommitFileDiffWorkspaceOverlay /> : null}
      onSidebarViewChange={setSidebarView}
      onMainViewChange={handleMainViewChange}
    />
  );
}
