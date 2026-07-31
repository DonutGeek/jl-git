import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp } from "lucide-react";

import {
  ChangeGroupChrome,
  ChangesPanelChrome,
  type ChangeListGroupMode,
  type ChangeSortMode,
  type ChangesViewMode,
} from "@/components/git/ChangesPanelChrome";
import { RepoLoadingIndicator } from "@/components/layout/RepoLoadingIndicator";

/** 变更列表懒加载 / 会话引导：外壳 + 未暂存 / 已暂存两块小加载（非整页一块） */
export function ChangesPanelLoadingShell() {
  const { t } = useTranslation();
  const label = t("common.loading");
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
