import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trans, useTranslation } from "react-i18next";
import {
  Cloud,
  Monitor,
  Plus,
  RefreshCw,
  Settings,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  BranchFolderRow,
  BranchGroup,
  BranchLeaf,
  flattenBranchTreeRows,
  type BranchContextActions,
  type BranchVisibleRow,
} from "@/components/git/BranchTree";
import { BranchListFilterMenu } from "@/components/git/BranchListFilterMenu";
import { CreateBranchDialog } from "@/components/git/CreateBranchDialog";
import { MergeBranchDialog } from "@/components/git/MergeBranchDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConflictOperationGuard } from "@/hooks/useConflictOperationGuard";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";
import { useProjectStore } from "@/store/useProjectStore";
import { openBranchCompareWindow } from "@/services/window/branchCompareWindow";
import { openBranchManageWindow } from "@/services/window/branchManageWindow";

import { toUserMessage } from "@/types/error";
import { GitBranch, GitMergeOptions } from "@/types/git";
import {
  filterAndSortBranches,
  patchBranchListPrefs,
  readBranchListPrefs,
  type BranchListPrefs,
} from "@/utils/branchListPrefs";
import { copyToClipboard } from "@/utils/clipboard";
import { deferUi } from "@/utils/deferUi";
import { buildBranchTree } from "@/utils/branchTree";
import { isLocalBranchPublished } from "@/utils/branchPublish";

const BRANCH_ROW_HEIGHT_PX = 28;
const BRANCH_VIRTUAL_OVERSCAN = 12;

type BranchListVisibleRow =
  | { kind: "group"; id: "local" | "remote"; open: boolean }
  | BranchVisibleRow;

/** 左栏：本地/远端分支树；单击选中，双击切换；右键菜单操作 */
export function BranchList() {
  const { t } = useTranslation();
  const branches = useRepoStore((state) => state.branches);
  const status = useRepoStore((state) => state.status);
  const loading = useRepoStore((state) => state.loading);
  const checkout = useRepoStore((state) => state.checkout);
  const refreshBranches = useRepoStore((state) => state.refreshBranches);
  const pullRemote = useRepoStore((state) => state.pull);
  const pushRemote = useRepoStore((state) => state.push);
  const deleteBranch = useRepoStore((state) => state.deleteBranch);
  const renameBranch = useRepoStore((state) => state.renameBranch);
  const mergeBranch = useRepoStore((state) => state.merge);
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

  const [renameTarget, setRenameTarget] = useState<GitBranch | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<GitBranch | null>(null);
  const [deleteRemoteAlso, setDeleteRemoteAlso] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [mergeTarget, setMergeTarget] = useState<GitBranch | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const { guard: guardWriteOp, dialog: conflictGuardDialog } =
    useConflictOperationGuard();

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
  const currentBranch = status?.branch ?? branches.find((item) => item.isCurrent)?.name ?? null;
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
    estimateSize: () => BRANCH_ROW_HEIGHT_PX,
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
    setCheckingOutName(branch.name);
    setSelectedName(branch.name);

    try {
      await checkout(branch.name);
      toast.success(t("repo.checkoutSuccess", { branch: branch.name }));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setCheckingOutName(null);
    }
  }

  function handleSelect(branch: GitBranch): void {
    setSelectedName(branch.name);
  }

  async function handlePull(branch: GitBranch): Promise<void> {
    if (!guardWriteOp()) {
      return;
    }
    const toastId = toast.loading(t("repo.pullStart"));
    try {
      const result = await pullRemote({
        remote: "origin",
        branch: branch.name,
      });
      const seconds = (result.elapsedMs / 1000).toFixed(3);
      if (result.conflict) {
        toast.error(t("repo.pullConflict"), { id: toastId });
      } else {
        toast.success(t("repo.pullSuccess", { remote: result.remote, seconds }), {
          id: toastId,
        });
      }
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    }
  }

  async function handlePush(branch: GitBranch): Promise<void> {
    const toastId = toast.loading(t("repo.pushStart"));
    try {
      const result = await pushRemote({
        remote: "origin",
        branch: branch.name,
      });
      const seconds = (result.elapsedMs / 1000).toFixed(3);
      toast.success(t("repo.pushSuccess", { remote: result.remote, seconds }), {
        id: toastId,
      });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    }
  }

  async function handlePublish(branch: GitBranch): Promise<void> {
    const toastId = toast.loading(t("repo.publishStart"));
    try {
      const result = await pushRemote({
        remote: "origin",
        branch: branch.name,
        setUpstream: true,
      });
      const seconds = (result.elapsedMs / 1000).toFixed(3);
      toast.success(t("repo.publishSuccess", { remote: result.remote, seconds }), {
        id: toastId,
      });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    }
  }

  async function handleCopyName(branch: GitBranch): Promise<void> {
    try {
      await copyToClipboard(branch.name);
      toast.success(t("repo.copyBranchNameSuccess"));
    } catch {
      toast.error(t("repo.copyBranchNameFailed"));
    }
  }

  function openRename(branch: GitBranch): void {
    setRenameTarget(branch);
    setRenameValue(branch.name);
    setRenameBusy(false);
  }

  async function submitRename(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!renameTarget || renameBusy) {
      return;
    }
    const from = renameTarget.name;
    const next = renameValue.trim();
    if (!next || next === from) {
      return;
    }

    flushSync(() => {
      setRenameTarget(null);
      setRenameBusy(false);
    });

    try {
      await renameBranch(from, next);
      setSelectedName(next);
      toast.success(t("repo.renameBranchSuccess", { name: next }));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  function openDelete(branch: GitBranch): void {
    // 等右键菜单卸载后再开确认框，避免焦点冲突导致无二次确认
    deferUi(() => {
      setDeleteTarget(branch);
      setDeleteRemoteAlso(false);
      setDeleteBusy(false);
    });
  }

  function openMerge(branch: GitBranch): void {
    if (!currentBranch || branch.name === currentBranch || mergeBusy) {
      return;
    }
    if (!guardWriteOp()) {
      return;
    }
    setMergeTarget(branch);
  }

  async function confirmMerge(options: GitMergeOptions): Promise<void> {
    if (!mergeTarget || !currentBranch || mergeBusy) {
      return;
    }

    const source = mergeTarget.name;
    const target = currentBranch;
    setMergeBusy(true);

    try {
      const result = await mergeBranch(source, options);
      if (result.conflict) {
        toast.error(t("repo.mergeConflict"));
      } else if (result.ok) {
        toast.success(t("repo.mergeSuccess", { source, target }));
      } else {
        toast.error(t("repo.mergeFailed"));
      }
      setMergeTarget(null);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setMergeBusy(false);
    }
  }

  const deleteHasRemote = useMemo(() => {
    if (!deleteTarget || deleteTarget.isRemote) {
      return false;
    }
    const remoteName = `origin/${deleteTarget.name}`;
    return branches.some((branch) => branch.isRemote && branch.name === remoteName);
  }, [branches, deleteTarget]);

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || deleteBusy) {
      return;
    }

    const targetName = deleteTarget.name;
    const alsoRemote = deleteHasRemote && deleteRemoteAlso;

    flushSync(() => {
      setDeleteTarget(null);
      setDeleteBusy(false);
      setDeleteRemoteAlso(false);
    });

    try {
      await deleteBranch(targetName, {
        force: true,
        deleteRemote: alsoRemote,
        remote: "origin",
      });
      if (selectedName === targetName) {
        setSelectedName(null);
      }
      toast.success(t("repo.deleteBranchSuccess", { name: targetName }));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    const toastId = toast.loading(t("repo.refreshStart"));
    try {
      await refreshBranches();
      toast.success(t("repo.refreshSuccess"), { id: toastId });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    } finally {
      setRefreshing(false);
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

  function handleCompareWithCurrent(branch: GitBranch): void {
    const currentBranch = status?.branch ?? branches.find((item) => item.isCurrent)?.name;
    if (!projectId || !currentBranch) {
      return;
    }
    void openBranchCompareWindow({
      projectId,
      mode: "branch",
      base: currentBranch,
      target: branch.name,
    }).catch((error: unknown) => {
      toast.error(toUserMessage(error) || t("agent.compareBranchesFailed"));
    });
  }

  const contextActions: BranchContextActions = {
    onCheckout: (branch) => void handleCheckout(branch),
    onPull: (branch) => void handlePull(branch),
    onPush: (branch) => void handlePush(branch),
    onPublish: (branch) => void handlePublish(branch),
    onRename: openRename,
    onCopyName: (branch) => void handleCopyName(branch),
    onCompareWithCurrent: handleCompareWithCurrent,
    canCompareWithCurrent: () => {
      const currentBranch = status?.branch ?? branches.find((item) => item.isCurrent)?.name;
      return Boolean(projectId && currentBranch);
    },
    onMergeIntoCurrent: openMerge,
    canMergeIntoCurrent: (branch) => Boolean(currentBranch && currentBranch !== branch.name),
    onDelete: openDelete,
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
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <div className="flex h-10 items-center gap-1 px-3">
          <h2 className="text-muted-foreground min-w-0 flex-1 text-xs font-semibold">
            {t("repo.branches")}
          </h2>

          <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-7 [&_svg]:size-3.5"
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

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-7 [&_svg]:size-3.5"
                  aria-label={t("repo.refresh")}
                  disabled={refreshing || loading}
                  onClick={() => void handleRefresh()}
                >
                  <RefreshCw
                    className={cn(refreshing && "animate-spin")}
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.refresh")}</TooltipContent>
            </Tooltip>

            <BranchListFilterMenu
              prefs={listPrefs}
              onChange={handleListPrefsChange}
            />

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-7 [&_svg]:size-3.5"
                  aria-label={t("repo.branchSettings")}
                  onClick={handleOpenBranchManage}
                >
                  <Settings aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.branchSettings")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="px-3 pb-1">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t("repo.branchFilterKeyword")}
            className="h-8 text-xs shadow-none"
            aria-label={t("repo.branchFilterKeyword")}
          />
        </div>
      </div>

      <ScrollArea
        ref={bindScrollArea}
        className="min-h-0 flex-1 px-3 py-0.5 [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full"
      >
        {isEmpty ? (
          <p className="text-muted-foreground px-2 py-3 text-xs">{t("repo.branchesEmpty")}</p>
        ) : noMatch ? (
          <p className="text-muted-foreground px-2 py-3 text-xs">{t("repo.branchesNoMatch")}</p>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const row = visibleRows[virtualItem.index];
              if (!row) {
                return null;
              }
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  className="absolute top-0 left-0 w-full"
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

      <CreateBranchDialog open={createOpen} onOpenChange={setCreateOpen} />

      <MergeBranchDialog
        open={Boolean(mergeTarget)}
        source={mergeTarget?.name ?? null}
        target={currentBranch}
        busy={mergeBusy}
        onOpenChange={(open) => {
          if (!open && !mergeBusy) {
            setMergeTarget(null);
          }
        }}
        onConfirm={(options) => void confirmMerge(options)}
      />

      {conflictGuardDialog}

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open && !renameBusy) {
            setRenameTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-sm gap-4 p-5 sm:rounded-lg">
          <DialogHeader>
            <DialogTitle>{t("repo.renameBranchTitle")}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void submitRename(event)}>
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder={t("repo.branchNamePlaceholder")}
              autoFocus
              disabled={renameBusy}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={renameBusy}
                onClick={() => setRenameTarget(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  renameBusy ||
                  !renameValue.trim() ||
                  renameValue.trim() === renameTarget?.name
                }
              >
                {t("repo.renameBranchAction")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md gap-4 p-5 sm:rounded-lg">
          <DialogHeader>
            <DialogTitle>{t("repo.deleteBranchTitle")}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-3">
            <TriangleAlert
              className="text-chart-4 mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1">
                <p className="text-foreground text-sm">
                  <Trans
                    i18nKey="repo.deleteBranchQuestion"
                    values={{ name: deleteTarget?.name ?? "" }}
                    components={{
                      name: <span className="font-mono font-medium" />,
                    }}
                  />
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("repo.deleteBranchIrreversible")}
                </p>
              </div>

              {deleteHasRemote ? (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs">
                    {t("repo.deleteBranchRemoteHint")}
                  </p>
                  <label className="text-foreground flex cursor-pointer items-center gap-2 text-sm select-none">
                    <input
                      type="checkbox"
                      className="border-input text-primary focus-visible:ring-ring size-3.5 shrink-0 rounded-sm border accent-primary"
                      checked={deleteRemoteAlso}
                      onChange={(event) => setDeleteRemoteAlso(event.target.checked)}
                      disabled={deleteBusy}
                    />
                    <span>{t("repo.deleteBranchRemoteCheckbox")}</span>
                  </label>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteBusy}
              onClick={() => setDeleteTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {t("repo.deleteBranchAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
