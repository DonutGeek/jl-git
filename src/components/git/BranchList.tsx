import { FormEvent, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  Cloud,
  ListFilter,
  Monitor,
  Plus,
  RefreshCw,
  Settings,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  BranchGroup,
  BranchTree,
  type BranchContextActions,
} from "@/components/git/BranchTree";
import { CreateBranchDialog } from "@/components/git/CreateBranchDialog";
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
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { GitBranch } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import { buildBranchTree } from "@/utils/branchTree";
import { isLocalBranchPublished } from "@/utils/branchPublish";

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

  const [checkingOutName, setCheckingOutName] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [localOpen, setLocalOpen] = useState(true);
  const [remoteOpen, setRemoteOpen] = useState(true);
  const [filter, setFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [renameTarget, setRenameTarget] = useState<GitBranch | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<GitBranch | null>(null);
  const [deleteRemoteAlso, setDeleteRemoteAlso] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filterLower = filter.trim().toLowerCase();

  const filteredBranches = useMemo(() => {
    if (filterLower.length === 0) {
      return branches;
    }
    return branches.filter((branch) => branch.name.toLowerCase().includes(filterLower));
  }, [branches, filterLower]);

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
    const toastId = toast.loading(t("repo.pullStart"));
    try {
      const result = await pullRemote({
        remote: "origin",
        branch: branch.name,
      });
      const seconds = (result.elapsedMs / 1000).toFixed(3);
      toast.success(t("repo.pullSuccess", { remote: result.remote, seconds }), {
        id: toastId,
      });
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
    setDeleteTarget(branch);
    setDeleteRemoteAlso(false);
    setDeleteBusy(false);
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

  function handleSoon(action: string): void {
    toast.message(t("repo.syncComingSoon", { action }));
  }

  const contextActions: BranchContextActions = {
    onCheckout: (branch) => void handleCheckout(branch),
    onPull: (branch) => void handlePull(branch),
    onPush: (branch) => void handlePush(branch),
    onPublish: (branch) => void handlePublish(branch),
    onRename: openRename,
    onCopyName: (branch) => void handleCopyName(branch),
    onDelete: openDelete,
  };

  const isEmpty = branches.length === 0;
  const noMatch = !isEmpty && filteredBranches.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-1.5 px-2.5 pt-2.5">
        <div className="flex items-center gap-1">
          <h2 className="text-muted-foreground min-w-0 flex-1 text-[11px] font-semibold tracking-wide uppercase">
            {t("repo.branches")}
          </h2>

          <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6 [&_svg]:size-3.5"
                  aria-label={t("repo.newBranch")}
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("repo.newBranch")}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6 [&_svg]:size-3.5"
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
              <TooltipContent side="bottom">{t("repo.refresh")}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6 [&_svg]:size-3.5"
                  aria-label={t("repo.branchFilterActions")}
                  onClick={() => handleSoon(t("repo.branchFilterActions"))}
                >
                  <ListFilter aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("repo.branchFilterActions")}</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6 [&_svg]:size-3.5"
                  aria-label={t("repo.branchSettings")}
                  onClick={() => handleSoon(t("repo.branchSettings"))}
                >
                  <Settings aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("repo.branchSettings")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("repo.filter")}
          className="h-7 text-xs"
          aria-label={t("repo.filter")}
        />
      </div>

      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full px-1 py-1">
          {isEmpty ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">{t("repo.branchesEmpty")}</p>
          ) : noMatch ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">{t("repo.branchesNoMatch")}</p>
          ) : (
            <div className="flex flex-col">
              <BranchGroup
                icon={<Monitor className="text-muted-foreground shrink-0" aria-hidden="true" />}
                label={t("repo.local")}
                open={localOpen}
                onToggle={() => setLocalOpen((prev) => !prev)}
              >
                <BranchTree
                  nodes={localTree}
                  depth={1}
                  variant="local"
                  treeId="local"
                  collapsedPaths={collapsedPaths}
                  onToggleCollapse={toggleCollapse}
                  onSelect={handleSelect}
                  onCheckout={(branch) => void handleCheckout(branch)}
                  contextActions={contextActions}
                  selectedName={selectedName}
                  checkingOutName={checkingOutName}
                  disabled={loading}
                  aheadCount={aheadCount}
                  isPublished={(branch) => isLocalBranchPublished(branch, branches)}
                />
              </BranchGroup>

              <BranchGroup
                icon={<Cloud className="text-muted-foreground shrink-0" aria-hidden="true" />}
                label={t("repo.remote")}
                open={remoteOpen}
                onToggle={() => setRemoteOpen((prev) => !prev)}
                trailing={
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground size-6 shrink-0 hover:bg-transparent [&_svg]:size-3.5"
                        aria-label={t("repo.newBranch")}
                        onClick={() => setCreateOpen(true)}
                      >
                        <Plus aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t("repo.newBranch")}</TooltipContent>
                  </Tooltip>
                }
              >
                <BranchTree
                  nodes={remoteTree}
                  depth={1}
                  variant="remote"
                  treeId="remote"
                  collapsedPaths={collapsedPaths}
                  onToggleCollapse={toggleCollapse}
                  onSelect={handleSelect}
                  onCheckout={(branch) => void handleCheckout(branch)}
                  contextActions={contextActions}
                  selectedName={selectedName}
                  checkingOutName={checkingOutName}
                  disabled={loading}
                  aheadCount={aheadCount}
                />
              </BranchGroup>
            </div>
          )}
        </ScrollArea>
      </div>

      <CreateBranchDialog open={createOpen} onOpenChange={setCreateOpen} />

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
