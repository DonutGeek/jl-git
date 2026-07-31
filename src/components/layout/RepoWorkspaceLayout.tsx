import type { AriaAttributes, ReactNode } from "react";

import { ActivityBar, type SidebarView } from "@/components/layout/ActivityBar";
import { RepoToolbar, type RepoMainView } from "@/components/layout/RepoToolbar";
import { ResizableSplit } from "@/components/layout/ResizableSplit";

import type { Project } from "@/types/project";

const SIDEBAR_MAIN_SPLIT_KEY = "jlgit:split:sidebar-main";
const SIDEBAR_MIN_WIDTH_PX = 240;

interface RepoWorkspaceLayoutProps extends Pick<AriaAttributes, "aria-busy" | "aria-label"> {
  project: Project;
  sidebarView: SidebarView;
  mainView: RepoMainView;
  toolbarLoading?: boolean;
  sidebar: ReactNode;
  main: ReactNode;
  /** 盖住侧栏+主区左侧的浮层（如历史提交文件对比） */
  coverOverlay?: ReactNode;
  onSidebarViewChange: (view: SidebarView) => void;
  onMainViewChange: (view: RepoMainView) => void;
}

export function RepoWorkspaceLayout({
  project,
  sidebarView,
  mainView,
  toolbarLoading = false,
  sidebar,
  main,
  coverOverlay,
  onSidebarViewChange,
  onMainViewChange,
  "aria-busy": ariaBusy,
  "aria-label": ariaLabel,
}: RepoWorkspaceLayoutProps) {
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-repo-workspace-layout="true"
      aria-busy={ariaBusy}
      aria-label={ariaLabel}
    >
      <RepoToolbar
        key={project.path}
        project={project}
        mainView={mainView}
        loadingShell={toolbarLoading}
        onMainViewChange={onMainViewChange}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <ActivityBar active={sidebarView} onChange={onSidebarViewChange} />
        <div
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
          data-repo-workspace-split="true"
        >
          <ResizableSplit
            orientation="horizontal"
            defaultRatio={5}
            minFirstPx={SIDEBAR_MIN_WIDTH_PX}
            minSecondPx={320}
            storageKey={SIDEBAR_MAIN_SPLIT_KEY}
            first={<aside className="h-full min-h-0 overflow-hidden">{sidebar}</aside>}
            second={<div className="h-full min-h-0 min-w-0 overflow-hidden">{main}</div>}
          />
          {coverOverlay}
        </div>
      </div>
    </div>
  );
}
