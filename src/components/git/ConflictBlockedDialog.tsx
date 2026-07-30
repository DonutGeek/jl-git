import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConflictBlockedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 有未解决冲突 vs 仅合并进行中 */
  reason: "conflict" | "inProgress";
}

/** 冲突/进行中操作拦截提示 */
export function ConflictBlockedDialog({ open, onOpenChange, reason }: ConflictBlockedDialogProps) {
  const { t } = useTranslation();

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
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("repo.conflictOpBlockedClose")}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
