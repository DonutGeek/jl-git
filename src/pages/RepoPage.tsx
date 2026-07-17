import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ActivityBar, type SidebarView } from "@/components/layout/ActivityBar";
import { RepoToolbar, type RepoMainView } from "@/components/layout/RepoToolbar";
import { SplitPane } from "@/components/layout/SplitPane";
import { BranchList } from "@/components/git/BranchList";
import { TagList } from "@/components/git/TagList";
import { AgentChatPanel } from "@/components/ai/AgentChatPanel";
import { ChangesPanel } from "@/components/git/ChangesPanel";
import { ChangesPreviewPane } from "@/components/git/ChangesPreviewPane";
import { CommitBox } from "@/components/git/CommitBox";
import { CommitFileDiffPane } from "@/components/git/CommitFileDiffPane";
import { FileTree } from "@/components/git/FileTree";
import { HistoryDetailPane } from "@/components/git/HistoryDetailPane";
import { HistoryList } from "@/components/git/HistoryList";
import { WorkspaceBrowser } from "@/components/git/WorkspaceBrowser";
import { cn } from "@/lib/utils";

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

import { useProjectStore } from "@/store/useProjectStore";
import { hasRepoSession, restoreRepoSession, beginRepoSwitch, useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { Project } from "@/types/project";

const SIDEBAR_MAIN_SPLIT_KEY = "jlgit:split:sidebar-main";
/** 目录树、分支与 Agent 共用的侧栏最小可拖拽宽度。 */
const SIDEBAR_MIN_WIDTH_PX = 240;
/** 变更列表在纵向分栏中的最小高度。 */
const CHANGES_LIST_MIN_HEIGHT_PX = 320;
const HISTORY_DETAIL_SPLIT_KEY = "jlgit:split:history-detail-v10";
/** 历史详情栏标记：弹层右缘相对此元素左缘对齐 */
const HISTORY_DETAIL_PANE_ATTR = "data-history-detail-pane";
/** SplitPane 水平分隔条为 w-1.5（6px）；弹层右缘让出，露出拖拽线 */
const HISTORY_SPLIT_SEPARATOR_PX = 6;

/** 从 store 同步取项目元数据（轻量，不含 Git 会话还原） */
function lookupProject(projectId: string | undefined): Project | null {
  if (!projectId) {
    return null;
  }
  return useProjectStore.getState().findById(projectId) ?? null;
}

// 清理历史分栏旧 key，避免读到过期比例
try {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("jlgit:split:history-detail") && key !== HISTORY_DETAIL_SPLIT_KEY) {
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

  const findById = useProjectStore((state) => state.findById);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const openExisting = useProjectStore((state) => state.openExisting);
  const loadAll = useRepoStore((state) => state.loadAll);
  const refreshStatus = useRepoStore((state) => state.refreshStatus);
  const reset = useRepoStore((state) => state.reset);
  const selectedCommitFile = useRepoStore((state) => state.selectedCommitFile);
  const conflictFocusEpoch = useRepoStore((state) => state.conflictFocusEpoch);

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
  /**
   * 文件对比弹层宽度：实测历史详情左缘，与右侧贴齐，不留缝。
   */
  const [commitFileDiffLeftPx, setCommitFileDiffLeftPx] = useState(0);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const commitFileDiffOverlayRef = useRef<HTMLDivElement>(null);

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

  // 绘制前轻量清空旧仓列表，避免「标签已是 B、列表还是 A」；比重灌缓存便宜得多
  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    const next = lookupProject(projectId);
    if (next && useRepoStore.getState().repoPath !== next.path) {
      beginRepoSwitch(next.path);
    }
  }, [active, projectId]);

  const showCommitFileDiff = mainView === "history" && Boolean(selectedCommitFile);

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

  // 弹层右缘：详情左缘再让出分隔条宽度，露出可拖拽线
  useLayoutEffect(() => {
    if (!showCommitFileDiff) {
      return;
    }

    function measureOverlayWidth(): void {
      const main = mainAreaRef.current;
      if (!main) {
        return;
      }
      const detail = main.querySelector<HTMLElement>(`[${HISTORY_DETAIL_PANE_ATTR}]`);
      if (!detail) {
        return;
      }
      const next = Math.round(
        detail.getBoundingClientRect().left -
          main.getBoundingClientRect().left -
          HISTORY_SPLIT_SEPARATOR_PX,
      );
      if (next > 0) {
        setCommitFileDiffLeftPx((prev) => (prev === next ? prev : next));
      }
    }

    measureOverlayWidth();
    const main = mainAreaRef.current;
    if (!main) {
      return;
    }
    const observer = new ResizeObserver(measureOverlayWidth);
    observer.observe(main);
    const detail = main.querySelector<HTMLElement>(`[${HISTORY_DETAIL_PANE_ATTR}]`);
    if (detail) {
      observer.observe(detail);
    }
    return () => observer.disconnect();
  }, [showCommitFileDiff]);

  useEffect(() => {
    if (!active || !projectId) {
      return;
    }

    const id = projectId;
    let cancelled = false;

    // 等浏览器画出标签/工具栏后再灌会话与拉 Git，削掉点击卡点
    const raf = window.requestAnimationFrame(() => {
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
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 随 projectId / active
  }, [projectId, active]);

  useEffect(() => {
    if (!active || !project) {
      return;
    }

    let refreshing = false;
    let refreshQueued = false;

    const refreshChanges = async (): Promise<void> => {
      if (refreshing) {
        refreshQueued = true;
        return;
      }

      refreshing = true;
      do {
        refreshQueued = false;
        try {
          await refreshStatus();
        } catch (refreshError) {
          // 自动刷新失败不打断当前操作；手动刷新仍会给出可见提示。
          console.warn("[RepoPage] refresh repository status failed", refreshError);
        }
      } while (refreshQueued);
      refreshing = false;
    };

    const handleWindowFocus = (): void => {
      void refreshChanges();
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        void refreshChanges();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
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

  if (bootstrapping && !project) {
    return (
      // 加载期无 RepoToolbar：整页可拖窗口，避免只能点到失效的标签栏留白
      <section data-tauri-drag-region className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-sm">{t("repo.opening")}</p>
        </div>
      </section>
    );
  }

  if ((error && !project) || !project) {
    return (
      <section data-tauri-drag-region className="flex h-full flex-col">
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
    <aside className="h-full min-h-0 overflow-hidden">
      {sidebarView === "files" ? <FileTree key={project.path} repoPath={project.path} /> : null}
      {sidebarView === "branches" ? <BranchList /> : null}
      {sidebarView === "tags" ? <TagList onSelectTag={() => handleMainViewChange("history")} /> : null}
      {sidebarView === "agent" ? (
        <AgentChatPanel projectId={project.id} repoPath={project.path} />
      ) : null}
    </aside>
  );

  const workspacePane = (
    <WorkspaceBrowser
      key={project.path}
      repoPath={project.path}
      repoName={project.name}
    />
  );

  const changesPane = (
    <SplitPane
      orientation="horizontal"
      defaultRatio={32}
      minFirstPx={320}
      minSecondPx={280}
      storageKey="jlgit:split:changes-preview-v2"
      first={
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
          <SplitPane
            orientation="vertical"
            defaultRatio={65}
            minFirstPx={CHANGES_LIST_MIN_HEIGHT_PX}
            // 提交区：勾选 + 信息框 + 提交按钮 + 可选「已提交」条，不可再压扁
            minSecondPx={200}
            storageKey="jlgit:split:changes-commit-v2"
            first={
              <div className="h-full min-h-0 overflow-hidden">
                <ChangesPanel />
              </div>
            }
            second={
              <div className="h-full min-h-0 overflow-hidden">
                <CommitBox />
              </div>
            }
          />
        </section>
      }
      second={
        <aside className="h-full min-h-0 overflow-hidden">
          <ChangesPreviewPane />
        </aside>
      }
    />
  );

  const historyPane = (
    <SplitPane
      orientation="horizontal"
      defaultRatio={68}
      minFirstPx={420}
      minSecondPx={280}
      storageKey={HISTORY_DETAIL_SPLIT_KEY}
      // 弹层打开时抬高分隔条，保证拖拽线可点且不被盖住
      separatorClassName={showCommitFileDiff ? "z-40" : undefined}
      first={
        <aside
          className={cn(
            "h-full min-h-0 min-w-0 overflow-hidden",
            // 避免拖拽结束后的残影 click 点到历史列表 → selectCommit 清空文件对比
            showCommitFileDiff && "pointer-events-none",
          )}
        >
          <HistoryList />
        </aside>
      }
      second={
        <aside className="h-full min-h-0 min-w-0 overflow-hidden" data-history-detail-pane="">
          <HistoryDetailPane />
        </aside>
      }
    />
  );

  function renderKeptPane(view: RepoMainView, pane: ReactNode): ReactNode {
    if (!visitedViews.has(view)) {
      return null;
    }
    return (
      <div
        className={cn(
          "h-full min-h-0 min-w-0 overflow-hidden",
          mainView === view ? "block" : "hidden",
        )}
        // 隐藏时不参与无障碍焦点遍历
        aria-hidden={mainView !== view}
      >
        {pane}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <RepoToolbar
        project={project}
        mainView={mainView}
        onMainViewChange={handleMainViewChange}
      />

      <div className="relative flex min-h-0 flex-1">
        <div ref={mainAreaRef} className="relative flex min-h-0 min-w-0 flex-1">
          <ActivityBar active={sidebarView} onChange={setSidebarView} />

          <SplitPane
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

          {/* 文件对比弹层：右缘贴齐历史详情；Esc / 顶栏关闭在 CommitFileDiffPane */}
          {showCommitFileDiff && commitFileDiffLeftPx > 0 ? (
            <div
              ref={commitFileDiffOverlayRef}
              className="bg-background absolute inset-y-0 left-0 z-30 overflow-hidden"
              style={{ width: commitFileDiffLeftPx }}
              role="dialog"
              aria-modal="true"
              aria-label={t("repo.commitFileDiffDialog")}
            >
              <CommitFileDiffPane />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
