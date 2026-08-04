import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { Cloud, Monitor, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  BranchFolderRow,
  BranchGroup,
  BranchLeaf,
  flattenBranchTreeRows,
  type BranchVisibleRow,
} from "@/components/git/BranchTree";
import { BranchListChrome } from "@/components/git/BranchListChrome";
import { CreateBranchDialog } from "@/components/git/CreateBranchDialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBranchContextActions } from "@/hooks/useBranchContextActions";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";
import { useProjectStore } from "@/store/useProjectStore";
import { openBranchManageWindow } from "@/services/window/branchManageWindow";

import { toUserMessage } from "@/types/error";
import type { GitBranch } from "@/types/git";
import {
  filterAndSortBranches,
  patchBranchListPrefs,
  readBranchListPrefs,
  type BranchListPrefs,
} from "@/utils/branchListPrefs";
import { buildBranchTree } from "@/utils/branchTree";
import { isLocalBranchPublished } from "@/utils/branchPublish";

const BRANCH_ROW_HEIGHT_PX = 30;
const BRANCH_GROUP_HEIGHT_PX = 36;
const BRANCH_VIRTUAL_OVERSCAN = 12;

type BranchListVisibleRow =
  { kind: "group"; id: "local" | "remote"; open: boolean } | BranchVisibleRow;

/** 左栏：本地/远端分支树；单击选中，双击切换；右键菜单操作 */
export function BranchList() {
  const { t } = useTranslation();
  const branches = useRepoStore((state) => state.branches);
  const status = useRepoStore((state) => state.status);
  const repoPath = useRepoStore((state) => state.repoPath);
  const loading = useRepoStore((state) => state.loading);
  const checkout = useRepoStore((state) => state.checkout);
  const refreshBranches = useRepoStore((state) => state.refreshBranches);
  const projectId = useProjectStore((state) => state.current?.id);

  const [checkingOutName, setCheckingOutName] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [localOpen, setLocalOpen] = useState(true);
  const [remoteOpen, setRemoteOpen] = useState(true);
  const [filter, setFilter] = useState("");
  const [listPrefs, setListPrefs] = useState<BranchListPrefs>(readBranchListPrefs);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const {
    contextActions: baseContextActions,
    dialogs: branchContextDialogs,
    conflictGuard: guardWriteOp,
  } = useBranchContextActions({
    onAfterRename: (_from, to) => setSelectedName(to),
    onAfterDelete: (name) => {
      setSelectedName((prev) => (prev === name ? null : prev));
    },
  });

  useEffect(() => {
    setCheckingOutName(null);
    setSelectedName(null);
    setCreateOpen(false);
    setRefreshing(false);
  }, [repoPath]);

  const filteredBranches = useMemo(
    () => filterAndSortBranches(branches, listPrefs, filter),
    [branches, filter, listPrefs],
  );

  function handleListPrefsChange(patch: Partial<BranchListPrefs>): void {
    setListPrefs((prev) => patchBranchListPrefs(prev, patch));
  }

  const localBranches = useMemo(
    () => filteredBranches.filter((branch) => !branch.isRemote),
    [filteredBranches],
  );
  const remoteBranches = useMemo(
    () => filteredBranches.filter((branch) => branch.isRemote),
    [filteredBranches],
  );

  const localTree = useMemo(() => buildBranchTree(localBranches), [localBranches]);
  const remoteTree = useMemo(() => buildBranchTree(remoteBranches), [remoteBranches]);
  const aheadCount = status?.ahead ?? 0;
  const isEmpty = branches.length === 0;
  const noMatch = !isEmpty && filteredBranches.length === 0;

  const visibleRows = useMemo((): BranchListVisibleRow[] => {
    const rows: BranchListVisibleRow[] = [{ kind: "group", id: "local", open: localOpen }];
    if (localOpen) {
      rows.push(...flattenBranchTreeRows(localTree, "local", "local", 1, collapsedPaths));
    }
    rows.push({ kind: "group", id: "remote", open: remoteOpen });
    if (remoteOpen) {
      rows.push(...flattenBranchTreeRows(remoteTree, "remote", "remote", 1, collapsedPaths));
    }
    return rows;
  }, [collapsedPaths, localOpen, localTree, remoteOpen, remoteTree]);

  const { viewport, bindScrollArea } = useScrollAreaViewport();
  const virtualizer = useVirtualizer({
    count: isEmpty || noMatch ? 0 : visibleRows.length,
    getScrollElement: () => viewport,
    estimateSize: (index) =>
      visibleRows[index]?.kind === "group" ? BRANCH_GROUP_HEIGHT_PX : BRANCH_ROW_HEIGHT_PX,
    overscan: BRANCH_VIRTUAL_OVERSCAN,
    getItemKey: (index) => {
      const row = visibleRows[index];
      if (!row) {
        return index;
      }
      return row.kind === "group" ? `group:${row.id}` : row.id;
    },
  });

  function toggleCollapse(key: string): void {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleCheckout(branch: GitBranch): Promise<void> {
    if (!guardWriteOp()) {
      return;
    }
    const originRepoPath = repoPath;
    if (!originRepoPath) {
      return;
    }
    setCheckingOutName(branch.name);
    setSelectedName(branch.name);
    const toastId = toast.loading(t("repo.checkoutStart", { branch: branch.name }));

    try {
      await checkout(branch.name);
      toast.dismiss(toastId);
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    } finally {
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setCheckingOutName(null);
      }
    }
  }

  function handleSelect(branch: GitBranch): void {
    setSelectedName(branch.name);
  }

  async function handleRefresh(): Promise<void> {
    const originRepoPath = repoPath;
    if (!originRepoPath) {
      return;
    }
    setRefreshing(true);
    const toastId = toast.loading(t("repo.refreshStart"));
    try {
      await refreshBranches();
      toast.success(t("repo.refreshSuccess"), { id: toastId });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    } finally {
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setRefreshing(false);
      }
    }
  }

  function handleOpenBranchManage(): void {
    if (!projectId) {
      toast.error(t("branchManage.projectNotFound"));
      return;
    }
    void openBranchManageWindow({ projectId }).catch((error: unknown) => {
      toast.error(toUserMessage(error) || t("branchManage.loadFailed"));
    });
  }

  const contextActions = {
    ...baseContextActions,
    onCheckout: (branch: GitBranch) => void handleCheckout(branch),
  };

  const remoteGroupTrailing = (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-6 shrink-0 hover:bg-transparent [&_svg]:size-3.5"
          aria-label={t("repo.newBranch")}
          onClick={() => {
            if (!guardWriteOp()) {
              return;
            }
            setCreateOpen(true);
          }}
        >
          <Plus aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("repo.newBranch")}</TooltipContent>
    </Tooltip>
  );

  function renderBranchRow(row: BranchListVisibleRow): ReactNode {
    if (row.kind === "group") {
      if (row.id === "local") {
        return (
          <BranchGroup
            icon={<Monitor className="text-muted-foreground shrink-0" aria-hidden="true" />}
            label={t("repo.local")}
            open={localOpen}
            onToggle={() => setLocalOpen((prev) => !prev)}
          />
        );
      }
      return (
        <BranchGroup
          icon={<Cloud className="text-muted-foreground shrink-0" aria-hidden="true" />}
          label={t("repo.remote")}
          open={remoteOpen}
          onToggle={() => setRemoteOpen((prev) => !prev)}
          trailing={remoteGroupTrailing}
        />
      );
    }

    if (row.kind === "folder") {
      return (
        <BranchFolderRow
          segment={row.segment}
          depth={row.depth}
          collapsed={row.collapsed}
          isRemoteName={row.isRemoteName}
          onToggle={() => toggleCollapse(row.id)}
          highlightQuery={filter}
        />
      );
    }

    const published =
      row.variant === "remote" ? true : isLocalBranchPublished(row.branch, branches);
    return (
      <BranchLeaf
        branch={row.branch}
        label={row.label}
        depth={row.depth}
        isBusy={checkingOutName === row.branch.name}
        disabled={loading}
        published={published}
        selected={selectedName === row.branch.name}
        aheadCount={aheadCount}
        onSelect={handleSelect}
        onCheckout={(branch) => void handleCheckout(branch)}
        contextActions={contextActions}
        highlightQuery={filter}
      />
    );
  }

  return (
    <>
      <BranchListChrome
        filter={filter}
        prefs={listPrefs}
        refreshing={refreshing}
        dataPending={loading}
        onFilterChange={setFilter}
        onPrefsChange={handleListPrefsChange}
        onCreate={() => {
          if (guardWriteOp()) {
            setCreateOpen(true);
          }
        }}
        onRefresh={() => void handleRefresh()}
        onManage={handleOpenBranchManage}
      >
        <ScrollArea
          ref={bindScrollArea}
          className={cn(
            "min-h-0 min-w-0 flex-1 px-3 py-0.5",
            "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full",
            "[&_[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:absolute [&_[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:right-0.5",
          )}
        >
          {isEmpty ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">{t("repo.branchesEmpty")}</p>
          ) : noMatch ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">{t("repo.branchesNoMatch")}</p>
          ) : (
            <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const row = visibleRows[virtualItem.index];
                if (!row) {
                  return null;
                }
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    className={cn(
                      "absolute top-0 left-0 w-full",
                      row.kind === "group" ? "py-1" : "py-px",
                    )}
                    style={{
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    {renderBranchRow(row)}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </BranchListChrome>

      <CreateBranchDialog open={createOpen} onOpenChange={setCreateOpen} />

      {branchContextDialogs}
    </>
  );
}
