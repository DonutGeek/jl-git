import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
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
    // 执行中禁止关闭，避免重复提交
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

    setSubmitting(true);
    try {
      await createBranch(branchName, {
        startPoint: start,
        checkout: checkoutAfterCreate,
      });
      onOpenChange(false);
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
          <FieldGroup className="gap-4">
            {lockedStart ? (
              <Field>
                <FieldLabel>{t("repo.createBranchBasedOn")}</FieldLabel>
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
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="create-branch-base">
                  {t("repo.createBranchBasedOn")}
                </FieldLabel>
                <GitRefPicker
                  id="create-branch-base"
                  value={startPoint}
                  options={startOptions}
                  disabled={submitting}
                  onValueChange={setStartPoint}
                />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="branch-name">{t("repo.branchName")}</FieldLabel>
              <Input
                id="branch-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("repo.branchNamePlaceholder")}
                autoFocus
                disabled={submitting}
              />
            </Field>

            {lockedStart ? (
              <Field orientation="horizontal">
                <Checkbox
                  id="create-branch-checkout"
                  checked={checkoutAfterCreate}
                  onCheckedChange={(checked) =>
                    setCheckoutAfterCreate(checked === true)
                  }
                  disabled={submitting}
                />
                <FieldLabel htmlFor="create-branch-checkout">
                  {t("repo.createBranchCheckoutAfter")}
                </FieldLabel>
              </Field>
            ) : null}
          </FieldGroup>

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
              {submitting ? <Spinner className="size-3.5" /> : null}
              {t("repo.createBranchAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
