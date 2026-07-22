import { FormEvent, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { GitBranch as GitBranchIcon, Tag } from "lucide-react";
import { toast } from "sonner";

import { GitRefPicker } from "@/components/git/GitRefPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import {
  filterAndSortBranches,
  readBranchListPrefs,
} from "@/utils/branchListPrefs";

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 固定起点（如标签名）；有值时不展示选择器 */
  fixedStartPoint?: string | null;
  /** 固定起点展示为标签 */
  fixedStartIsTag?: boolean;
}

/** 创建分支弹窗：名称 + 选择基线分支（不含关联需求 / 新工作区） */
export function CreateBranchDialog({
  open,
  onOpenChange,
  fixedStartPoint = null,
  fixedStartIsTag = false,
}: CreateBranchDialogProps) {
  const { t } = useTranslation();
  const branches = useRepoStore((state) => state.branches);
  const createBranch = useRepoStore((state) => state.createBranch);
  const loading = useRepoStore((state) => state.loading);

  const [name, setName] = useState("");
  const [startPoint, setStartPoint] = useState("");
  const [checkoutAfterCreate, setCheckoutAfterCreate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const lockedStart = Boolean(fixedStartPoint?.trim());

  // 与侧栏分支列表共用排序偏好
  const startOptions = useMemo(() => {
    const sortedBranches = filterAndSortBranches(
      branches,
      readBranchListPrefs(),
      "",
    );
    const localBranches = sortedBranches.filter((branch) => !branch.isRemote);
    const remoteBranches = sortedBranches.filter((branch) => branch.isRemote);
    return [
      ...localBranches.map((branch) => ({
        key: `local:${branch.name}`,
        value: branch.name,
        label: branch.name,
      })),
      ...remoteBranches.map((branch) => ({
        key: `remote:${branch.name}`,
        value: branch.name,
        label: branch.name,
      })),
    ];
  }, [branches]);

  // 仅在打开瞬间重置表单，避免输入时被 branches 引用变化冲掉
  useEffect(() => {
    if (!open) {
      return;
    }

    setName("");
    setSubmitting(false);
    const locked = fixedStartPoint?.trim() ?? "";
    if (locked) {
      setStartPoint(locked);
      // 从标签创建时默认不自动检出，与常见客户端一致
      setCheckoutAfterCreate(false);
    } else {
      // 无默认起点；须用户主动选择
      setStartPoint("");
      setCheckoutAfterCreate(true);
    }
  }, [open, fixedStartPoint]);

  const canSubmit =
    !submitting &&
    !loading &&
    name.trim().length > 0 &&
    startPoint.trim().length > 0;

  function handleOpenChange(next: boolean): void {
    if (!next && submitting) {
      return;
    }
    onOpenChange(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const branchName = name.trim();
    const start = startPoint.trim();

    // 无论成败都先关弹窗，步骤与结果只看操作日志
    flushSync(() => {
      onOpenChange(false);
    });

    setSubmitting(true);
    try {
      await createBranch(branchName, {
        startPoint: start,
        checkout: checkoutAfterCreate,
      });
      toast.success(
        checkoutAfterCreate
          ? t("repo.createBranchSuccess", { name: branchName })
          : t("repo.createBranchSuccessNoCheckout", { name: branchName }),
      );
    } catch (submitError) {
      toast.error(toUserMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn("flex max-w-md flex-col gap-4 overflow-hidden p-5 sm:rounded-lg")}
      >
        <DialogHeader>
          <DialogTitle>{t("repo.createBranchTitle")}</DialogTitle>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {lockedStart ? (
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-sm">
                {t("repo.createBranchBasedOn")}
              </p>
              <div className="border-border bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                {fixedStartIsTag ? (
                  <Tag className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <GitBranchIcon
                    className="text-muted-foreground size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 truncate font-mono">{startPoint}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="create-branch-base" className="text-sm font-medium">
                {t("repo.createBranchBasedOn")}
              </label>
              <GitRefPicker
                id="create-branch-base"
                value={startPoint}
                options={startOptions}
                disabled={submitting}
                onValueChange={setStartPoint}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="branch-name" className="text-sm font-medium">
              {t("repo.branchName")}
            </label>
            <Input
              id="branch-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("repo.branchNamePlaceholder")}
              autoFocus
              disabled={submitting}
            />
          </div>

          {lockedStart ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checkoutAfterCreate}
                onChange={(event) => setCheckoutAfterCreate(event.target.checked)}
                disabled={submitting}
              />
              <span>{t("repo.createBranchCheckoutAfter")}</span>
            </label>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {t("repo.createBranchAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
