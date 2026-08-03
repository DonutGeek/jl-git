import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { SelectMenu } from "@/components/common/SelectMenu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { GitMergeMode, GitMergeOptions } from "@/types/git";

interface MergeBranchDialogProps {
  open: boolean;
  source: string | null;
  target: string | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (options: GitMergeOptions) => void;
}

const MERGE_MODE_OPTIONS: GitMergeMode[] = [
  "default",
  "noFf",
  "squash",
  "resolve",
  "ort",
  "noCommit",
];

export function MergeBranchDialog({
  open,
  source,
  target,
  busy,
  onOpenChange,
  onConfirm,
}: MergeBranchDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<GitMergeMode>("default");
  const [autostash, setAutostash] = useState(false);
  const squash = mode === "squash";

  useEffect(() => {
    if (open) {
      setMode("default");
      setAutostash(false);
    }
  }, [open]);

  useEffect(() => {
    if (squash) {
      setAutostash(false);
    }
  }, [squash]);

  const title = t("repo.mergeTitle", {
    source: source ?? "",
    target: target ?? "",
  });
  const actionLabel = t("repo.mergeAction", { source, target });

  const modeOptions = MERGE_MODE_OPTIONS.map((value) => ({
    value,
    label: t(`repo.mergeMode${value[0].toUpperCase()}${value.slice(1)}`),
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <AppDialogContent className="min-w-0">
        <DialogHeader>
          <DialogTitle className="min-w-0 pr-6 text-base break-words">{title}</DialogTitle>
        </DialogHeader>

        <FieldGroup className="min-w-0 gap-4">
          <Field className="min-w-0">
            <FieldLabel>{t("repo.mergeMode")}</FieldLabel>
            <SelectMenu
              value={mode}
              options={modeOptions}
              disabled={busy}
              ariaLabel={t("repo.mergeMode")}
              triggerClassName="min-w-0 max-w-full"
              onChange={(next) => setMode(next as GitMergeMode)}
            />
          </Field>

          {/* 勾选与 label 同行垂直居中；说明单独一行，避免 FieldContent 把对齐顶偏 */}
          <div className="space-y-1.5">
            <Field
              orientation="horizontal"
              className="w-auto items-center gap-2"
              data-disabled={busy || squash || undefined}
            >
              <Checkbox
                id="merge-autostash"
                className="size-3.5"
                checked={autostash}
                disabled={busy || squash}
                onCheckedChange={(checked) => setAutostash(checked === true)}
              />
              <FieldLabel htmlFor="merge-autostash" className="font-normal">
                {t("repo.mergeAutostash")}
              </FieldLabel>
            </Field>
            {squash ? (
              <FieldDescription className="pl-5">
                {t("repo.mergeAutostashUnavailable")}
              </FieldDescription>
            ) : null}
          </div>
        </FieldGroup>

        {/* 主按钮独占一行；关闭仍用右上角 X */}
        <DialogFooter className="min-w-0 sm:flex-col sm:justify-stretch">
          <Button
            type="button"
            className="w-full min-w-0"
            disabled={!source || !target || busy}
            onClick={() => onConfirm({ mode, autostash: squash ? false : autostash })}
            aria-label={busy ? t("repo.mergeRunning") : actionLabel}
          >
            {busy ? <Spinner className="size-3.5" /> : null}
            <span className="min-w-0 truncate" title={busy ? undefined : actionLabel}>
              {busy ? t("repo.mergeRunning") : actionLabel}
            </span>
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
