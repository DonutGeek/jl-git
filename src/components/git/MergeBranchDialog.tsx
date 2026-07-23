import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { SelectMenu } from "@/components/common/SelectMenu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { GitMergeMode, GitMergeOptions } from "@/types/git";

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
      <DialogContent className="max-w-md gap-5 p-5 sm:rounded-lg">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5 text-sm">
            <span className="text-foreground">{t("repo.mergeMode")}</span>
            <SelectMenu
              value={mode}
              options={modeOptions}
              disabled={busy}
              ariaLabel={t("repo.mergeMode")}
              onChange={(next) => setMode(next as GitMergeMode)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-foreground flex cursor-pointer items-center gap-2 text-sm select-none">
              <Checkbox
                checked={autostash}
                disabled={busy || squash}
                onCheckedChange={(checked) => setAutostash(checked === true)}
              />
              <span>{t("repo.mergeAutostash")}</span>
            </label>
            {squash ? (
              <p className="text-muted-foreground pl-6 text-xs">
                {t("repo.mergeAutostashUnavailable")}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!source || !target || busy}
            onClick={() => onConfirm({ mode, autostash: squash ? false : autostash })}
          >
            {busy ? <Spinner className="size-3.5" /> : null}
            {busy ? t("repo.mergeRunning") : t("repo.mergeAction", { source, target })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
