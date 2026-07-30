import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  ChevronDown,
  MoreVertical,
  Search,
} from "lucide-react";

import { BranchListChrome } from "@/components/git/BranchListChrome";
import {
  ChangeGroupChrome,
  ChangesPanelChrome,
  type ChangeListGroupMode,
  type ChangeSortMode,
  type ChangesViewMode,
} from "@/components/git/ChangesPanelChrome";
import { CommitBox } from "@/components/git/CommitBox";
import { FileTreeChrome } from "@/components/git/FileTreeChrome";
import {
  HistoryDetailChrome,
  HistoryListChrome,
  HistoryWorkspaceChrome,
} from "@/components/git/HistoryWorkspaceChrome";
import { TagListChrome } from "@/components/git/TagListChrome";
import {
  WorkspaceBrowserChrome,
  type BrowserViewMode,
} from "@/components/git/WorkspaceBrowserChrome";
import type { SidebarView } from "@/components/layout/ActivityBar";
import { RepoLoadingIndicator } from "@/components/layout/RepoLoadingIndicator";
import {
  REPO_CHANGES_LOADING_AREAS,
  REPO_LOADING_LABEL_KEY,
  REPO_MAIN_LOADING_AREA,
} from "@/components/layout/repoLoadingLayout";
import type { RepoMainView } from "@/components/layout/RepoToolbar";
import { RepoWorkspaceLayout } from "@/components/layout/RepoWorkspaceLayout";
import { ResizableSplit } from "@/components/layout/ResizableSplit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Project } from "@/types/project";
import { DEFAULT_BRANCH_LIST_PREFS } from "@/utils/branchListPrefs";
import { DEFAULT_TAG_LIST_PREFS } from "@/utils/tagListPrefs";

const CHANGES_LIST_MIN_HEIGHT_PX = 320;

interface RepoLoadingWorkspaceProps {
  project: Project;
  sidebarView: SidebarView;
  mainView: RepoMainView;
  label: string;
  onSidebarViewChange: (view: SidebarView) => void;
  onMainViewChange: (view: RepoMainView) => void;
}

function ChangesDataLoadingPane({ label }: { label: string }) {
  const { t } = useTranslation();
  const [view, setView] = useState<ChangesViewMode>("list");
  const [sortMode, setSortMode] = useState<ChangeSortMode>("default");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showLineStats, setShowLineStats] = useState(false);
  const [listGroupMode, setListGroupMode] = useState<ChangeListGroupMode>("default");

  return (
    <ChangesPanelChrome
      view={view}
      sortMode={sortMode}
      searchOpen={searchOpen}
      searchQuery={searchQuery}
      showLineStats={showLineStats}
      listGroupMode={listGroupMode}
      treeActionsDisabled
      onViewChange={setView}
      onSortModeChange={setSortMode}
      onExpandAll={() => undefined}
      onCollapseAll={() => undefined}
      onToggleSearch={() => {
        setSearchOpen((open) => !open);
        if (searchOpen) {
          setSearchQuery("");
        }
      }}
      onSearchQueryChange={setSearchQuery}
      onSearchEscape={() => {
        setSearchOpen(false);
        setSearchQuery("");
      }}
      onShowLineStatsChange={setShowLineStats}
      onListGroupModeChange={setListGroupMode}
      unstaged={
        <ChangeGroupChrome
          title={t("repo.changesCount", { count: 0 })}
          action={<ArrowDown aria-hidden="true" />}
          actionLabel={t("repo.stageAll")}
          actionDisabled
          onAction={() => undefined}
        >
          <RepoLoadingIndicator area="unstaged" label={label} />
        </ChangeGroupChrome>
      }
      staged={
        <ChangeGroupChrome
          title={t("repo.stagedCount", { count: 0 })}
          action={<ArrowUp aria-hidden="true" />}
          actionLabel={t("repo.unstageAll")}
          actionDisabled
          onAction={() => undefined}
        >
          <RepoLoadingIndicator area="staged" label={label} />
        </ChangeGroupChrome>
      }
    />
  );
}

function WorkspaceDataLoadingPane({ project, label }: { project: Project; label: string }) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<BrowserViewMode>("grid");

  return (
    <WorkspaceBrowserChrome
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      pathContent={
        <div
          className="border-input bg-background flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2"
          data-repo-workspace-path="true"
        >
          <span className="text-muted-foreground shrink-0 text-xs">{t("repo.pathLabel")}</span>
          <span className="text-muted-foreground/60 text-xs" aria-hidden="true">
            |
          </span>
          <span className="text-muted-foreground truncate text-xs font-medium">{project.name}</span>
        </div>
      }
    >
      <div className="min-h-0 flex-1">
        <RepoLoadingIndicator area={REPO_MAIN_LOADING_AREA} label={label} />
      </div>
    </WorkspaceBrowserChrome>
  );
}

function HistoryDataLoadingPane({ label }: { label: string }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  return (
    <HistoryWorkspaceChrome
      list={
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <HistoryListChrome aria-label={t("repo.historyFilters")}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-28 shrink-0 justify-between gap-1 px-2 text-xs font-normal shadow-none"
              disabled
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {t("repo.historyCurrentBranch")}
              </span>
              <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
            </Button>
            <div className="relative min-w-28 flex-1">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("repo.historySearchPlaceholder")}
                className="h-7 pr-2 pl-7 text-xs shadow-none"
                aria-label={t("repo.historySearch")}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7"
              aria-label={t("repo.historySort")}
              disabled
            >
              <ArrowDownWideNarrow className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7"
              aria-label={t("repo.historyMore")}
              disabled
            >
              <MoreVertical className="size-3.5" aria-hidden="true" />
            </Button>
          </HistoryListChrome>
          <div className="min-h-0 flex-1">
            <RepoLoadingIndicator area={REPO_MAIN_LOADING_AREA} label={label} />
          </div>
        </div>
      }
      detail={
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <HistoryDetailChrome>
            <span className="text-muted-foreground text-sm font-medium">
              {t("repo.commitDetailTitle")}
            </span>
          </HistoryDetailChrome>
          <div className="min-h-0 flex-1">
            <RepoLoadingIndicator area={REPO_MAIN_LOADING_AREA} label={label} />
          </div>
        </div>
      }
    />
  );
}

function SidebarDataLoadingPane({
  sidebarView,
  label,
}: {
  sidebarView: SidebarView;
  label: string;
}) {
  const [branchFilter, setBranchFilter] = useState("");
  const [fileFilter, setFileFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  if (sidebarView === "branches") {
    return (
      <BranchListChrome
        filter={branchFilter}
        prefs={DEFAULT_BRANCH_LIST_PREFS}
        dataPending
        onFilterChange={setBranchFilter}
        onPrefsChange={() => undefined}
        onCreate={() => undefined}
        onRefresh={() => undefined}
        onManage={() => undefined}
      >
        <div className="min-h-0 flex-1">
          <RepoLoadingIndicator area={REPO_CHANGES_LOADING_AREAS[0]} label={label} />
        </div>
      </BranchListChrome>
    );
  }

  if (sidebarView === "files") {
    return (
      <FileTreeChrome
        filter={fileFilter}
        dataPending
        onFilterChange={setFileFilter}
        onRefresh={() => undefined}
      >
        <div className="min-h-0 flex-1">
          <RepoLoadingIndicator area={REPO_CHANGES_LOADING_AREAS[0]} label={label} />
        </div>
      </FileTreeChrome>
    );
  }

  if (sidebarView === "tags") {
    return (
      <TagListChrome
        filter={tagFilter}
        prefs={DEFAULT_TAG_LIST_PREFS}
        dataPending
        onFilterChange={setTagFilter}
        onPrefsChange={() => undefined}
        onCreate={() => undefined}
        onRefresh={() => undefined}
      >
        <div className="min-h-0 flex-1">
          <RepoLoadingIndicator area={REPO_CHANGES_LOADING_AREAS[0]} label={label} />
        </div>
      </TagListChrome>
    );
  }

  return <RepoLoadingIndicator area={REPO_CHANGES_LOADING_AREAS[0]} label={label} />;
}

function LoadingMainPane({
  mainView,
  label,
  project,
  projectPath,
}: {
  mainView: RepoMainView;
  label: string;
  project: Project;
  projectPath: string;
}) {
  if (mainView === "workspace") {
    return <WorkspaceDataLoadingPane project={project} label={label} />;
  }

  if (mainView === "history") {
    return <HistoryDataLoadingPane label={label} />;
  }

  return (
    <ResizableSplit
      orientation="horizontal"
      defaultRatio={32}
      minFirstPx={320}
      minSecondPx={280}
      storageKey="jlgit:split:changes-preview"
      first={
        <section className="h-full min-h-0 overflow-hidden">
          <ResizableSplit
            orientation="vertical"
            defaultRatio={65}
            minFirstPx={CHANGES_LIST_MIN_HEIGHT_PX}
            minSecondPx={200}
            storageKey="jlgit:split:changes-commit"
            first={<ChangesDataLoadingPane label={label} />}
            second={
              <div className="h-full min-h-0 overflow-hidden">
                <CommitBox key={projectPath} loadingShell />
              </div>
            }
          />
        </section>
      }
      second={
        <aside className="h-full min-h-0 overflow-hidden">
          <RepoLoadingIndicator area={REPO_CHANGES_LOADING_AREAS[3]} label={label} />
        </aside>
      }
    />
  );
}

export function RepoLoadingWorkspace({
  project,
  sidebarView,
  mainView,
  label,
  onSidebarViewChange,
  onMainViewChange,
}: RepoLoadingWorkspaceProps) {
  const { t } = useTranslation();
  const loadingLabel = t(REPO_LOADING_LABEL_KEY);

  return (
    <RepoWorkspaceLayout
      project={project}
      sidebarView={sidebarView}
      mainView={mainView}
      toolbarLoading
      aria-busy="true"
      aria-label={label}
      sidebar={<SidebarDataLoadingPane sidebarView={sidebarView} label={loadingLabel} />}
      main={
        <LoadingMainPane
          mainView={mainView}
          label={loadingLabel}
          project={project}
          projectPath={project.path}
        />
      }
      onSidebarViewChange={onSidebarViewChange}
      onMainViewChange={onMainViewChange}
    />
  );
}
