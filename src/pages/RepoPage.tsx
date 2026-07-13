import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ActivityBar, type SidebarView } from "@/components/layout/ActivityBar";
import { RepoTabBar } from "@/components/layout/RepoTabBar";
import { RepoToolbar, type RepoMainView } from "@/components/layout/RepoToolbar";
import { SplitPane } from "@/components/layout/SplitPane";
import { BranchList } from "@/components/git/BranchList";
import { ChangesPanel } from "@/components/git/ChangesPanel";
import { ChangesPreviewPane } from "@/components/git/ChangesPreviewPane";
import { CommitBox } from "@/components/git/CommitBox";
import { FileTree } from "@/components/git/FileTree";
import { HistoryDetailPane } from "@/components/git/HistoryDetailPane";
import { HistoryList } from "@/components/git/HistoryList";
import { WorkspaceBrowser } from "@/components/git/WorkspaceBrowser";
import { cn } from "@/lib/utils";

import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { hasRepoSession, useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { Project } from "@/types/project";

// 清理历史分栏旧 key，避免读到过期比例
try {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("jlgit:split:history-detail") && key !== "jlgit:split:history-detail-v9") {
      localStorage.removeItem(key);
    }
  }
} catch {
  // ignore
}

export function RepoPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();

  const findById = useProjectStore((state) => state.findById);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const openExisting = useProjectStore((state) => state.openExisting);
  const openTab = useOpenTabsStore((state) => state.openTab);

  const loadAll = useRepoStore((state) => state.loadAll);
  const reset = useRepoStore((state) => state.reset);

  const [project, setProject] = useState<Project | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarView, setSidebarView] = useState<SidebarView>("branches");
  const [mainView, setMainView] = useState<RepoMainView>("changes");
  /** 已访问过的主视图保活，避免来回切换反复挂载 */
  const [visitedViews, setVisitedViews] = useState<ReadonlySet<RepoMainView>>(
    () => new Set<RepoMainView>(["changes"]),
  );

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  useEffect(() => {
    let active = true;

    async function init(): Promise<void> {
      if (!projectId) {
        return;
      }

      const isFirstOpen = !project || project.id !== projectId;
      setError(null);

      // 同步切壳：标签已导航后立刻换项目壳，避免等 SQLite / Git 才反馈
      const cached = findById(projectId);
      const hasSession = Boolean(cached && hasRepoSession(cached.path));

      if (cached && isFirstOpen) {
        setProject(cached);
        // 有会话缓存则不挡交互；仅冷开仓显示切换遮罩
        setSwitching(!hasSession);
        openTab(cached.id);
      } else if (!project) {
        setBootstrapping(true);
      } else if (isFirstOpen) {
        setSwitching(true);
      }

      try {
        let target = cached ?? findById(projectId);

        if (!target) {
          await loadProjects();
          target = findById(projectId);
        }

        if (!target) {
          throw new Error(t("repo.notFound"));
        }

        openTab(target.id);
        if (active) {
          setProject(target);
          setBootstrapping(false);
        }

        // 最近打开记录与 Git 数据并行；不阻塞标签切换
        void openExisting(target.id).catch((touchError) => {
          console.warn("[RepoPage] touchOpened failed", touchError);
        });
        await loadAll(target.path);

        if (active) {
          setSwitching(false);
        }
      } catch (initError) {
        if (active) {
          const message = toUserMessage(initError);
          setError(message);
          setBootstrapping(false);
          setSwitching(false);
          toast.error(message);
        }
      }
    }

    void init();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随 projectId 切换
  }, [projectId]);

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
      <section className="flex h-full flex-col">
        <RepoTabBar />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        </div>
      </section>
    );
  }

  if ((error && !project) || !project) {
    return (
      <section className="flex h-full flex-col">
        <RepoTabBar />
        <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-destructive text-sm" role="alert">
            {error ?? t("repo.notFound")}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">{t("common.back")}</Link>
          </Button>
        </div>
      </section>
    );
  }

  const sidebar = (
    <aside className="h-full min-h-0 overflow-hidden">
      {sidebarView === "files" ? (
        <FileTree key={project.path} repoPath={project.path} />
      ) : (
        <BranchList />
      )}
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
      minFirstPx={240}
      minSecondPx={280}
      storageKey="jlgit:split:changes-preview-v2"
      first={
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
          <SplitPane
            orientation="vertical"
            defaultRatio={65}
            minFirstPx={120}
            minSecondPx={120}
            storageKey="jlgit:split:changes-commit"
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
      storageKey="jlgit:split:history-detail-v9"
      first={
        <aside className="h-full min-h-0 overflow-hidden">
          <HistoryList />
        </aside>
      }
      second={
        <aside className="h-full min-h-0 overflow-hidden">
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
      <RepoTabBar />
      <RepoToolbar
        project={project}
        mainView={mainView}
        onMainViewChange={handleMainViewChange}
      />

      <div className="relative flex min-h-0 flex-1">
        {switching ? (
          <div
            className="bg-background/40 absolute inset-0 z-20 flex items-start justify-center pt-8"
            aria-busy="true"
            aria-live="polite"
          >
            <p className="bg-background text-muted-foreground rounded-md border px-3 py-1.5 text-xs shadow-sm">
              {t("common.loading")}
            </p>
          </div>
        ) : null}

        <div className={cn("flex min-h-0 min-w-0 flex-1", switching && "pointer-events-none opacity-60")}>
          <ActivityBar active={sidebarView} onChange={setSidebarView} />

          <SplitPane
            orientation="horizontal"
            defaultRatio={22}
            minFirstPx={160}
            minSecondPx={320}
            storageKey="jlgit:split:sidebar-main"
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
