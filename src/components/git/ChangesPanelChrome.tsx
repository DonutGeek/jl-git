import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownWideNarrow,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  List,
  ListTree,
  MoreVertical,
  Search,
} from "lucide-react";

import { ResizableSplit } from "@/components/layout/ResizableSplit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { resolveChangesToolbarLeadingControl } from "@/utils/changesToolbarLayout";

export type ChangesViewMode = "list" | "tree";
export type ChangeSortMode = "default" | "status" | "name";
export type ChangeListGroupMode = "default" | "status" | "date";

interface ChangesPanelChromeProps {
  view: ChangesViewMode;
  sortMode: ChangeSortMode;
  searchOpen: boolean;
  searchQuery: string;
  showLineStats: boolean;
  listGroupMode: ChangeListGroupMode;
  treeActionsDisabled: boolean;
  unstaged: ReactNode;
  staged: ReactNode;
  onViewChange: (view: ChangesViewMode) => void;
  onSortModeChange: (mode: ChangeSortMode) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onToggleSearch: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearchEscape: () => void;
  onShowLineStatsChange: (show: boolean) => void;
  onListGroupModeChange: (mode: ChangeListGroupMode) => void;
}

interface ChangeGroupChromeProps {
  title: string;
  titleSlot?: ReactNode;
  action: ReactNode;
  actionLabel: string;
  actionDisabled?: boolean;
  onAction: () => void;
  /** 分组标题右键菜单项 */
  contextMenu?: ReactNode;
  children: ReactNode;
}

/**
 * 变更分区稳定外壳。真实列表与 Loading 仅注入内容；
 * Git action 的可用性完全由调用方控制。
 */
export function ChangeGroupChrome({
  title,
  titleSlot,
  action,
  actionLabel,
  actionDisabled = false,
  onAction,
  contextMenu,
  children,
}: ChangeGroupChromeProps) {
  const header = (
    <div className="group/header hover:bg-accent/60 flex h-7 items-center justify-between gap-1 rounded-md px-2 transition-colors">
      <div className="flex min-w-0 flex-1 items-center">
        {titleSlot ?? (
          <h3 className="text-muted-foreground min-w-0 truncate text-[11px] font-medium">
            {title}
          </h3>
        )}
      </div>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-6 shrink-0 [&_svg]:size-3",
              "opacity-0 transition-opacity",
              "group-hover/header:opacity-100 focus-visible:opacity-100",
              "disabled:opacity-0 group-hover/header:disabled:opacity-40",
            )}
            onClick={onAction}
            disabled={actionDisabled}
            aria-label={actionLabel}
          >
            {action}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{actionLabel}</TooltipContent>
      </Tooltip>
    </div>
  );

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden py-1">
      <div className="shrink-0 px-2">
        {contextMenu ? (
          <ContextMenu>
            <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
            <ContextMenuContent className="min-w-48">{contextMenu}</ContextMenuContent>
          </ContextMenu>
        ) : (
          header
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

/**
 * Changes 面板共享外壳：只渲染受控工具栏和双分栏，不读取仓库状态，
 * 也不对变更数据进行筛选、排序或树形派生。
 */
export function ChangesPanelChrome({
  view,
  sortMode,
  searchOpen,
  searchQuery,
  showLineStats,
  listGroupMode,
  treeActionsDisabled,
  unstaged,
  staged,
  onViewChange,
  onSortModeChange,
  onExpandAll,
  onCollapseAll,
  onToggleSearch,
  onSearchQueryChange,
  onSearchEscape,
  onShowLineStatsChange,
  onListGroupModeChange,
}: ChangesPanelChromeProps) {
  const { t } = useTranslation();
  const leadingControl = resolveChangesToolbarLeadingControl(view, searchOpen);

  return (
    <div className="flex h-full min-h-0 flex-col" data-repo-shell="changes">
      <div
        className="border-border relative flex h-8 shrink-0 items-center border-b px-2"
        data-changes-toolbar="true"
      >
        {searchOpen ? (
          <Input
            autoFocus
            type="search"
            value={searchQuery}
            placeholder={t("repo.changesSearchPlaceholder")}
            aria-label={t("repo.changesSearch")}
            className="mr-2 h-6 min-w-0 flex-1 px-2 text-xs"
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onSearchEscape();
              }
            }}
          />
        ) : null}

        {leadingControl === "sort" ? (
          <DropdownMenu>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-6",
                      sortMode === "default"
                        ? "text-muted-foreground"
                        : "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                    )}
                    aria-label={t("repo.changesSort")}
                  >
                    <ArrowDownWideNarrow className="size-3.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("repo.changesSort")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-36">
              {(
                [
                  ["default", t("repo.changesSortDefault")],
                  ["status", t("repo.changesSortStatus")],
                  ["name", t("repo.changesSortName")],
                ] as const
              ).map(([mode, label]) => (
                <DropdownMenuItem key={mode} onSelect={() => onSortModeChange(mode)}>
                  <span className="flex-1">{label}</span>
                  {sortMode === mode ? <Check className="size-3.5" aria-hidden="true" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {leadingControl === "tree-actions" ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6"
                  aria-label={t("repo.expandAll")}
                  onClick={onExpandAll}
                  disabled={treeActionsDisabled}
                >
                  <ChevronsUpDown className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.expandAll")}</TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6"
                  aria-label={t("repo.collapseAll")}
                  onClick={onCollapseAll}
                  disabled={treeActionsDisabled}
                >
                  <ChevronsDownUp className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.collapseAll")}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}

        {!searchOpen ? (
          <div
            className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5"
            role="group"
            aria-label={t("repo.changesViewMode")}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 gap-1 px-2 text-xs transition-colors",
                view === "list"
                  ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "text-muted-foreground",
              )}
              aria-pressed={view === "list"}
              onClick={() => onViewChange("list")}
            >
              <List className="size-3.5" aria-hidden="true" />
              {t("repo.viewList")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 gap-1 px-2 text-xs transition-colors",
                view === "tree"
                  ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "text-muted-foreground",
              )}
              aria-pressed={view === "tree"}
              onClick={() => onViewChange("tree")}
            >
              <ListTree className="size-3.5" aria-hidden="true" />
              {t("repo.viewTree")}
            </Button>
          </div>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "text-muted-foreground size-6",
                  searchOpen && "bg-accent text-accent-foreground",
                )}
                aria-label={t("repo.changesSearch")}
                aria-pressed={searchOpen}
                onClick={onToggleSearch}
              >
                <Search className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.changesSearch")}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-6 data-[state=open]:bg-accent"
                    aria-label={t("repo.historyMore")}
                  >
                    <MoreVertical className="size-3.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("repo.historyMore")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuCheckboxItem
                checked={showLineStats}
                onCheckedChange={(checked) => onShowLineStatsChange(checked === true)}
                onSelect={(event) => event.preventDefault()}
              >
                {t("repo.commitShowLineStats")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={listGroupMode === "status"}
                onCheckedChange={(checked) =>
                  onListGroupModeChange(checked === true ? "status" : "default")
                }
                onSelect={(event) => event.preventDefault()}
              >
                {t("repo.changesGroupByStatus")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={listGroupMode === "date"}
                onCheckedChange={(checked) =>
                  onListGroupModeChange(checked === true ? "date" : "default")
                }
                onSelect={(event) => event.preventDefault()}
              >
                {t("repo.changesGroupByDate")}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ResizableSplit
          orientation="vertical"
          defaultRatio={55}
          minFirstPx={120}
          minSecondPx={120}
          storageKey="jlgit:split:changes-staged"
          first={unstaged}
          second={staged}
        />
      </div>
    </div>
  );
}
