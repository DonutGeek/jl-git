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
        <ResizableSplit
          orientation="horizontal"
          defaultRatio={5}
          minFirstPx={SIDEBAR_MIN_WIDTH_PX}
          minSecondPx={320}
          storageKey={SIDEBAR_MAIN_SPLIT_KEY}
          first={<aside className="h-full min-h-0 overflow-hidden">{sidebar}</aside>}
          second={<div className="h-full min-h-0 min-w-0 overflow-hidden">{main}</div>}
        />
      </div>
    </div>
  );
}
