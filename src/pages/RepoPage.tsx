import {
  Activity,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ActivityBar, type SidebarView } from "@/components/layout/ActivityBar";
import { RepoToolbar, type RepoMainView } from "@/components/layout/RepoToolbar";
import { ResizableSplit } from "@/components/layout/ResizableSplit";
import { BranchList } from "@/components/git/BranchList";
import { CommitBox } from "@/components/git/CommitBox";
import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import { useWindowChromeLayout } from "@/hooks/useWindowChromeLayout";

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

import { useProjectStore } from "@/store/useProjectStore";
import { useRepoNavStore } from "@/store/useRepoNavStore";
import {
  hasRepoSession,
  restoreRepoSession,
  beginRepoSwitch,
  useRepoStore,
} from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";

const SIDEBAR_MAIN_SPLIT_KEY = "jlgit:split:sidebar-main";
/** 目录树、分支与 Agent 共用的侧栏最小可拖拽宽度。 */
const SIDEBAR_MIN_WIDTH_PX = 240;
/** 变更列表在纵向分栏中的最小高度。 */
const CHANGES_LIST_MIN_HEIGHT_PX = 320;
const HISTORY_DETAIL_SPLIT_KEY = "jlgit:split:history-detail";

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

export function RepoPage({ projectId, active }: RepoPageProps) {
  const { t } = useTranslation();
  const { isMacOverlay } = useWindowChromeLayout();
  const dragProps = isMacOverlay ? ({ "data-tauri-drag-region": true } as const) : {};

  const findById = useProjectStore((state) => state.findById);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const openExisting = useProjectStore((state) => state.openExisting);
  const loadAll = useRepoStore((state) => state.loadAll);
  const refreshStatus = useRepoStore((state) => state.refreshStatus);
  const reset = useRepoStore((state) => state.reset);
  const conflictFocusEpoch = useRepoStore((state) => state.conflictFocusEpoch);
  const fileTreeReveal = useRepoNavStore((state) => state.fileTreeReveal);

  const [project, setProject] = useState<Project | null>(() => lookupProject(projectId));
  const [bootstrapping, setBootstrapping] = useState(() => !lookupProject(projectId));
  const [error, setError] = useState<string | null>(null);
  /** 跟踪 props id，在 render 阶段只换轻量壳 */
  const [routeProjectId, setRouteProjectId] = useState(projectId);
  const [sidebarView, setSidebarView] = useState<SidebarView>("branches");
  const [mainView, setMainView] = useState<RepoMainView>("changes");
  /** 已访问过的主视图保活，避免来回切换反复挂载 */
  const [visitedViews, setVisitedViews] = useState<ReadonlySet<RepoMainView>>(
    () => new Set<RepoMainView>(["changes"]),
  );
  const hasApiKey = useHasAgentApiKey();

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
    if (!active || !project) {
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
  }, [active, project, sidebarView]);

  // 换仓：本帧只换工具栏元数据，不碰 Git store（避免点击同步重渲）
  if (projectId !== routeProjectId) {
    setRouteProjectId(projectId);
    const next = lookupProject(projectId);
    setProject(next);
    setBootstrapping(!next);
    setError(null);
  }

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
    setVisitedViews((prev) => {
      if (prev.has("changes")) {
        return prev;
      }
      const next = new Set(prev);
      next.add("changes");
      return next;
    });
  }, [active, conflictFocusEpoch]);

  useEffect(() => {
    if (!active || !projectId) {
      return;
    }

    const id = projectId;
    let cancelled = false;

    let loadTimer: number | null = null;
    // rAF 内只安排宏任务：浏览器会先提交标签 / 工具栏这一帧，再切 Store 与拉 Git。
    const raf = window.requestAnimationFrame(() => {
      loadTimer = window.setTimeout(() => {
        void (async () => {
          setError(null);

          try {
            let target = findById(id) ?? lookupProject(id);

            if (!target) {
              await loadProjects();
              target = lookupProject(id);
            }

            if (!target) {
              throw new Error(t("repo.notFound"));
            }

            if (cancelled) {
              return;
            }

            // 每次重新激活都先尝试还原会话。
            // 否则「同 path 但列表已被 beginRepoSwitch 清空」时会误判 alreadyShowing，
            // 只刷 status → 分支一直空，还会把空列表写回缓存。
            const cacheHit = hasRepoSession(target.path);
            if (cacheHit) {
              restoreRepoSession(target.path);
            } else if (useRepoStore.getState().repoPath !== target.path) {
              beginRepoSwitch(target.path);
            }

            setProject(target);
            setBootstrapping(false);

            void openExisting(target.id).catch((touchError) => {
              console.warn("[RepoPage] touchOpened failed", touchError);
            });

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
              setError(message);
              setBootstrapping(false);
              toast.error(message);
            }
          }
        })();
      }, 0);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      if (loadTimer !== null) {
        window.clearTimeout(loadTimer);
      }
    };
  }, [projectId, active]);

  useEffect(() => {
    if (!active || !project) {
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
  }, [active, project, refreshStatus]);

  function handleMainViewChange(view: RepoMainView): void {
    setVisitedViews((prev) => {
      if (prev.has(view)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(view);
      return next;
    });
    setMainView(view);
  }

  // 目录树点击文件：切到工作区并打开预览
  useEffect(() => {
    if (!workspacePreview) {
      return;
    }
    handleMainViewChange("workspace");
  }, [workspacePreview]);

  if (bootstrapping && !project) {
    return (
      // 加载期无 RepoToolbar：整页可拖窗口，避免只能点到失效的标签栏留白
      <section {...dragProps} className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-sm">{t("repo.opening")}</p>
        </div>
      </section>
    );
  }

  if ((error && !project) || !project) {
    return (
      <section {...dragProps} className="flex h-full flex-col">
        <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-destructive text-sm" role="alert">
            {error ?? t("repo.notFound")}
          </p>
          <div style={noDragStyle}>
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
      defaultRatio={32}
      minFirstPx={320}
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
                <Suspense fallback={<RepoModuleLoading />}>
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
          <Suspense fallback={<RepoModuleLoading />}>
            <LazyChangesPreviewPane key={project.path} />
          </Suspense>
        </aside>
      }
    />
  );

  const historyPane = (
    <Suspense fallback={<RepoModuleLoading />}>
      <LazyHistoryWorkspace key={project.path} />
    </Suspense>
  );

  function renderKeptPane(view: RepoMainView, pane: ReactNode): ReactNode {
    if (!visitedViews.has(view)) {
      return null;
    }
    return (
      <Activity mode={mainView === view ? "visible" : "hidden"}>
        <div className="h-full min-h-0 min-w-0 overflow-hidden">{pane}</div>
      </Activity>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <RepoToolbar
        key={project.path}
        project={project}
        mainView={mainView}
        onMainViewChange={handleMainViewChange}
      />

      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <ActivityBar active={sidebarView} onChange={setSidebarView} />

          <ResizableSplit
            orientation="horizontal"
            defaultRatio={5}
            minFirstPx={SIDEBAR_MIN_WIDTH_PX}
            minSecondPx={320}
            storageKey={SIDEBAR_MAIN_SPLIT_KEY}
            first={sidebar}
            second={
              <div className="h-full min-h-0 min-w-0 overflow-hidden">
                {renderKeptPane("workspace", workspacePane)}
                {renderKeptPane("changes", changesPane)}
                {renderKeptPane("history", historyPane)}
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
