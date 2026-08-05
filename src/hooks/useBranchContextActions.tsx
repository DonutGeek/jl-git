import type { FormEvent, ReactNode } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { BranchContextActions } from "@/components/git/BranchContextMenuContent";
import { MergeBranchDialog } from "@/components/git/MergeBranchDialog";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useConflictOperationGuard } from "@/hooks/useConflictOperationGuard";
import { openBranchCompareWindow } from "@/services/window/branchCompareWindow";
import { useProjectStore } from "@/store/useProjectStore";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";
import type { GitBranch, GitMergeOptions } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import { deferUi } from "@/utils/deferUi";
import { isPushRejectedError, toastPushError } from "@/utils/gitPushError";

export interface UseBranchContextActionsOptions {
  /** 打开重命名/删除/合并等 Dialog 前（例如关闭工具栏下拉） */
  onBeforeDialog?: () => void;
  /** 覆盖默认检出（工具栏可复用自身 checkout + 关菜单） */
  onCheckout?: (branch: GitBranch) => void;
  /** 重命名成功后（左栏可更新选中名） */
  onAfterRename?: (from: string, to: string) => void;
  /** 删除成功后 */
  onAfterDelete?: (name: string) => void;
}

export interface UseBranchContextActionsResult {
  contextActions: BranchContextActions;
  /** 冲突守卫 + 重命名/删除/合并对话框，挂到调用方树下 */
  dialogs: ReactNode;
  conflictGuard: ReturnType<typeof useConflictOperationGuard>["guard"];
}

/**
 * 分支右键菜单动作与确认对话框（左栏 BranchList / 工具栏下拉共用）。
 */
export function useBranchContextActions(
  options: UseBranchContextActionsOptions = {},
): UseBranchContextActionsResult {
  const { onBeforeDialog, onCheckout, onAfterRename, onAfterDelete } = options;
  const { t } = useTranslation();
  const branches = useRepoStore((state) => state.branches);
  const status = useRepoStore((state) => state.status);
  const repoPath = useRepoStore((state) => state.repoPath);
  const checkout = useRepoStore((state) => state.checkout);
  const pullRemote = useRepoStore((state) => state.pull);
  const pushRemote = useRepoStore((state) => state.push);
  const fetchRemote = useRepoStore((state) => state.fetch);
  const deleteBranch = useRepoStore((state) => state.deleteBranch);
  const renameBranch = useRepoStore((state) => state.renameBranch);
  const mergeBranch = useRepoStore((state) => state.merge);
  const projectId = useProjectStore((state) => state.current?.id);

  const [renameTarget, setRenameTarget] = useState<GitBranch | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<GitBranch | null>(null);
  const [deleteRemoteAlso, setDeleteRemoteAlso] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [mergeTarget, setMergeTarget] = useState<GitBranch | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const { guard: guardWriteOp, dialog: conflictGuardDialog } = useConflictOperationGuard();
  const renameFieldId = useId();
  const deleteRemoteFieldId = useId();

  const currentBranch = status?.branch ?? branches.find((item) => item.isCurrent)?.name ?? null;

  useEffect(() => {
    setRenameTarget(null);
    setRenameValue("");
    setRenameBusy(false);
    setDeleteTarget(null);
    setDeleteRemoteAlso(false);
    setDeleteBusy(false);
    setMergeTarget(null);
    setMergeBusy(false);
  }, [repoPath]);

  const deleteHasRemote = useMemo(() => {
    if (!deleteTarget || deleteTarget.isRemote) {
      return false;
    }
    const remoteName = `origin/${deleteTarget.name}`;
    return branches.some((branch) => branch.isRemote && branch.name === remoteName);
  }, [branches, deleteTarget]);

  async function handleCheckout(branch: GitBranch): Promise<void> {
    if (onCheckout) {
      onCheckout(branch);
      return;
    }
    if (!guardWriteOp()) {
      return;
    }
    const originRepoPath = repoPath;
    if (!originRepoPath) {
      return;
    }
    // 切分支：工具栏/列表已有忙态，成功不弹 toast，避免挡住顶栏按钮
    try {
      await checkout(branch.name);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handlePull(branch: GitBranch): Promise<void> {
    if (!guardWriteOp()) {
      return;
    }
    // 更新：成功静默；仅冲突/失败提示
    try {
      const result = await pullRemote({
        remote: "origin",
        branch: branch.name,
      });
      if (result.conflict) {
        toast.error(t("repo.pullConflict"));
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handlePush(branch: GitBranch): Promise<void> {
    const originPath = useRepoStore.getState().repoPath;
    if (!originPath) {
      return;
    }
    try {
      await pushRemote({
        repoPath: originPath,
        remote: "origin",
        branch: branch.name,
      });
    } catch (error) {
      const stillOnOrigin = useRepoStore.getState().repoPath === originPath;
      toastPushError(error, {
        onUpdate: stillOnOrigin ? () => void handlePull(branch) : undefined,
      });
      if (isPushRejectedError(error) && stillOnOrigin) {
        void fetchRemote().catch(() => undefined);
      }
    }
  }

  async function handlePublish(branch: GitBranch): Promise<void> {
    const originPath = useRepoStore.getState().repoPath;
    if (!originPath) {
      return;
    }
    try {
      await pushRemote({
        repoPath: originPath,
        remote: "origin",
        branch: branch.name,
        setUpstream: true,
      });
    } catch (error) {
      const stillOnOrigin = useRepoStore.getState().repoPath === originPath;
      toastPushError(error, {
        onUpdate: stillOnOrigin ? () => void handlePull(branch) : undefined,
      });
      if (isPushRejectedError(error) && stillOnOrigin) {
        void fetchRemote().catch(() => undefined);
      }
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
    onBeforeDialog?.();
    deferUi(() => {
      setRenameTarget(branch);
      setRenameValue(branch.name);
      setRenameBusy(false);
    });
  }

  function openDelete(branch: GitBranch): void {
    onBeforeDialog?.();
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
    onBeforeDialog?.();
    deferUi(() => {
      setMergeTarget(branch);
    });
  }

  async function submitRename(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!renameTarget || renameBusy) {
      return;
    }
    const from = renameTarget.name;
    const next = renameValue.trim();
    const originRepoPath = repoPath;
    if (!originRepoPath || !next || next === from) {
      return;
    }

    setRenameBusy(true);
    try {
      await renameBranch(from, next);
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setRenameTarget(null);
      }
      onAfterRename?.(from, next);
      toast.success(t("repo.renameBranchSuccess", { name: next }));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setRenameBusy(false);
      }
    }
  }

  async function confirmMerge(mergeOptions: GitMergeOptions): Promise<void> {
    if (!mergeTarget || !currentBranch || mergeBusy) {
      return;
    }

    const source = mergeTarget.name;
    const originRepoPath = repoPath;
    if (!originRepoPath) {
      return;
    }
    setMergeBusy(true);

    try {
      const result = await mergeBranch(source, mergeOptions);
      if (result.conflict) {
        toast.error(t("repo.mergeConflict"));
      } else if (!result.ok) {
        toast.error(t("repo.mergeFailed"));
      }
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setMergeTarget(null);
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setMergeBusy(false);
      }
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || deleteBusy) {
      return;
    }

    const targetName = deleteTarget.name;
    const alsoRemote = deleteHasRemote && deleteRemoteAlso;
    const originRepoPath = repoPath;
    if (!originRepoPath) {
      return;
    }

    setDeleteBusy(true);
    try {
      await deleteBranch(targetName, {
        force: true,
        deleteRemote: alsoRemote,
        remote: "origin",
      });
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setDeleteTarget(null);
        setDeleteRemoteAlso(false);
      }
      onAfterDelete?.(targetName);
      toast.success(t("repo.deleteBranchSuccess", { name: targetName }));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setDeleteBusy(false);
      }
    }
  }

  function handleCompareWithCurrent(branch: GitBranch): void {
    const base = status?.branch ?? branches.find((item) => item.isCurrent)?.name;
    if (!projectId || !base) {
      return;
    }
    onBeforeDialog?.();
    void openBranchCompareWindow({
      projectId,
      mode: "branch",
      base,
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
      const base = status?.branch ?? branches.find((item) => item.isCurrent)?.name;
      return Boolean(projectId && base);
    },
    onMergeIntoCurrent: openMerge,
    canMergeIntoCurrent: (branch) => Boolean(currentBranch && currentBranch !== branch.name),
    onDelete: openDelete,
  };

  const dialogs = (
    <>
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
        onConfirm={(mergeOptions) => void confirmMerge(mergeOptions)}
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
        <AppDialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t("repo.renameBranchTitle")}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void submitRename(event)}>
            <Field>
              <FieldLabel className="sr-only" htmlFor={renameFieldId}>
                {t("repo.branchName")}
              </FieldLabel>
              <Input
                id={renameFieldId}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                placeholder={t("repo.branchNamePlaceholder")}
                autoFocus
                disabled={renameBusy}
              />
            </Field>
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
                  renameBusy || !renameValue.trim() || renameValue.trim() === renameTarget?.name
                }
              >
                {renameBusy ? <Spinner className="size-3.5" /> : null}
                {t("repo.renameBranchAction")}
              </Button>
            </DialogFooter>
          </form>
        </AppDialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) {
            setDeleteTarget(null);
          }
        }}
      >
        <AppDialogContent>
          <DialogHeader>
            <DialogTitle>{t("repo.deleteBranchTitle")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-foreground text-sm">
              <Trans
                i18nKey="repo.deleteBranchQuestion"
                values={{ name: deleteTarget?.name ?? "" }}
                components={{
                  name: <span className="font-mono font-medium" />,
                }}
              />
            </p>

            {deleteHasRemote ? (
              <Field orientation="horizontal">
                <Checkbox
                  id={deleteRemoteFieldId}
                  checked={deleteRemoteAlso}
                  onCheckedChange={(checked) => setDeleteRemoteAlso(checked === true)}
                  disabled={deleteBusy}
                />
                <FieldContent>
                  <FieldLabel htmlFor={deleteRemoteFieldId}>
                    {t("repo.deleteBranchRemoteCheckbox")}
                  </FieldLabel>
                </FieldContent>
              </Field>
            ) : null}
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
              {deleteBusy ? <Spinner className="size-3.5" /> : null}
              {t("repo.deleteBranchAction")}
            </Button>
          </DialogFooter>
        </AppDialogContent>
      </Dialog>
    </>
  );

  return { contextActions, dialogs, conflictGuard: guardWriteOp };
}
