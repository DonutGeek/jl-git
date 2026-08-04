import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";

interface ConflictBlockedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 有未解决冲突 vs 仅合并进行中 */
  reason: "conflict" | "inProgress";
}

/** 冲突/进行中操作拦截提示 */
export function ConflictBlockedDialog({ open, onOpenChange, reason }: ConflictBlockedDialogProps) {
  const { t } = useTranslation();
  const abortOperation = useRepoStore((state) => state.abortOperation);
  const [aborting, setAborting] = useState(false);

  async function handleAbort(): Promise<void> {
    setAborting(true);
    try {
      await abortOperation();
      toast.success(t("repo.abortOperationSuccess"));
      onOpenChange(false);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setAborting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent showCloseButton>
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-2">
            <span className="border-destructive/40 bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium">
              <TriangleAlert className="size-3" aria-hidden="true" />
              {t("repo.conflictOpBlockedTag")}
            </span>
            <DialogTitle className="text-base">{t("repo.conflictOpBlockedTitle")}</DialogTitle>
          </div>
          <DialogDescription className="text-foreground/90 text-sm leading-relaxed">
            {reason === "conflict"
              ? t("repo.conflictOpBlockedMessage")
              : t("repo.conflictOpBlockedInProgress")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={aborting}
            onClick={() => onOpenChange(false)}
          >
            {t("repo.conflictOpBlockedClose")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={aborting}
            onClick={() => void handleAbort()}
          >
            {aborting ? t("repo.abortOperationRunning") : t("repo.abortOperation")}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
