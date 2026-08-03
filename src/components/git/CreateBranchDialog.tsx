import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch as GitBranchIcon, Sparkles, Tag } from "lucide-react";
import { toast } from "sonner";

import { GenerateBranchNameDialog } from "@/components/git/GenerateBranchNameDialog";
import { GitRefPicker } from "@/components/git/GitRefPicker";
import { Button } from "@/components/ui/button";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import { useAppPrefsStore } from "@/store/useAppPrefsStore";
import { useRepoStore } from "@/store/useRepoStore";

import { listRemotes } from "@/services/git";
import { toUserMessage } from "@/types/error";
import { filterAndSortBranches, readBranchListPrefs } from "@/utils/branchListPrefs";
import { normalizeBranchPrefix } from "@/utils/branchPrefix";

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 固定起点（如标签名）；有值时不展示选择器 */
  fixedStartPoint?: string | null;
  /** 固定起点展示为标签 */
  fixedStartIsTag?: boolean;
}

/** 创建分支弹窗：名称 + 基线 + 可选检出/发布 */
export function CreateBranchDialog({
  open,
  onOpenChange,
  fixedStartPoint = null,
  fixedStartIsTag = false,
}: CreateBranchDialogProps) {
  const { t } = useTranslation();
  const repoPath = useRepoStore((state) => state.repoPath);
  const status = useRepoStore((state) => state.status);
  const branches = useRepoStore((state) => state.branches);
  const createBranch = useRepoStore((state) => state.createBranch);
  const pushRemote = useRepoStore((state) => state.push);
  const loading = useRepoStore((state) => state.loading);
  const branchPrefix = useAppPrefsStore((state) => state.branchPrefix);
  const hasApiKey = useHasAgentApiKey();

  const [name, setName] = useState("");
  const [startPoint, setStartPoint] = useState("");
  const [checkoutAfterCreate, setCheckoutAfterCreate] = useState(true);
  const [publishAfterCreate, setPublishAfterCreate] = useState(false);
  const [hasRemote, setHasRemote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const lockedStart = Boolean(fixedStartPoint?.trim());

  const startOptions = useMemo(() => {
    const sortedBranches = filterAndSortBranches(branches, readBranchListPrefs(), "");
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

  const currentBranch = useMemo(() => {
    if (!status?.detached && status?.branch?.trim()) {
      return status.branch.trim();
    }
    return branches.find((branch) => !branch.isRemote && branch.isCurrent)?.name ?? "";
  }, [branches, status?.branch, status?.detached]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(normalizeBranchPrefix(branchPrefix));
    setSubmitting(false);
    setAiDialogOpen(false);
    setPublishAfterCreate(false);
    setHasRemote(false);
    const locked = fixedStartPoint?.trim() ?? "";
    if (locked) {
      setStartPoint(locked);
      // 从标签创建时默认不自动检出，与常见客户端一致
      setCheckoutAfterCreate(false);
    } else {
      setStartPoint(currentBranch);
      setCheckoutAfterCreate(true);
    }

    if (!repoPath) {
      return;
    }
    let cancelled = false;
    void listRemotes(repoPath)
      .then((remotes) => {
        if (!cancelled) {
          setHasRemote(remotes.length > 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasRemote(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, fixedStartPoint, branchPrefix, repoPath, currentBranch]);

  const canSubmit =
    !submitting && !loading && name.trim().length > 0 && startPoint.trim().length > 0;

  function handleOpenChange(next: boolean): void {
    if (!next && submitting) {
      return;
    }
    onOpenChange(next);
  }

  function handleCheckoutChange(checked: boolean): void {
    setCheckoutAfterCreate(checked);
    if (!checked) {
      setPublishAfterCreate(false);
    }
  }

  function handlePublishChange(checked: boolean): void {
    if (!hasRemote) {
      return;
    }
    setPublishAfterCreate(checked);
    if (checked) {
      // 发布需要先检出才能设置 upstream
      setCheckoutAfterCreate(true);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const branchName = name.trim();
    const start = startPoint.trim();
    const shouldPublish = publishAfterCreate && hasRemote;
    const shouldCheckout = checkoutAfterCreate || shouldPublish;

    setSubmitting(true);
    try {
      await createBranch(branchName, {
        startPoint: start,
        checkout: shouldCheckout,
      });

      if (!shouldPublish) {
        onOpenChange(false);
        return;
      }

      try {
        await pushRemote({
          remote: "origin",
          branch: branchName,
          setUpstream: true,
        });
        onOpenChange(false);
      } catch (publishError) {
        onOpenChange(false);
        toast.error(
          t("repo.createBranchPublishFailed", {
            name: branchName,
            message: toUserMessage(publishError),
          }),
        );
      }
    } catch (submitError) {
      toast.error(toUserMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <AppDialogContent className="flex flex-col overflow-hidden">
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
                <div className="relative">
                  <Input
                    id="branch-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("repo.branchNamePlaceholder")}
                    autoFocus
                    disabled={submitting}
                    className="pr-9 font-mono"
                  />
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <span className="absolute top-1/2 right-1 -translate-y-1/2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={submitting || !hasApiKey}
                          aria-label={
                            !hasApiKey ? t("common.aiApiKeyRequired") : t("repo.aiGenerateBranch")
                          }
                          onClick={() => setAiDialogOpen(true)}
                        >
                          <Sparkles className="size-3.5" aria-hidden="true" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {!hasApiKey ? t("common.aiApiKeyRequired") : t("repo.aiGenerateBranch")}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </Field>

              <Field orientation="horizontal">
                <Checkbox
                  id="create-branch-checkout"
                  checked={checkoutAfterCreate}
                  onCheckedChange={(checked) => handleCheckoutChange(checked === true)}
                  disabled={submitting || publishAfterCreate}
                />
                <FieldLabel htmlFor="create-branch-checkout">
                  {t("repo.createBranchCheckoutAfter")}
                </FieldLabel>
              </Field>

              <Field orientation="horizontal">
                <Checkbox
                  id="create-branch-publish"
                  checked={publishAfterCreate}
                  onCheckedChange={(checked) => handlePublishChange(checked === true)}
                  disabled={submitting || !hasRemote}
                />
                <FieldLabel htmlFor="create-branch-publish">
                  {t("repo.createBranchPublishAfter")}
                </FieldLabel>
              </Field>
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
        </AppDialogContent>
      </Dialog>

      <GenerateBranchNameDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        onGenerated={setName}
      />
    </>
  );
}
