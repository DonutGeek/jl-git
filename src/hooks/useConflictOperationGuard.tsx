import { useCallback, useState, type ReactNode } from "react";

import { ConflictBlockedDialog } from "@/components/git/ConflictBlockedDialog";
import { useRepoStore } from "@/store/useRepoStore";
import { hasUnresolvedConflicts, isWriteOpBlocked } from "@/utils/repoOperationGuard";

type BlockReason = "conflict" | "inProgress";

/**
 * 冲突或合并进行中时拦截写操作，弹出提示对话框。
 * `guard()` 返回 false 表示已拦截，调用方勿继续执行。
 */
export function useConflictOperationGuard(): {
  guard: () => boolean;
  blocked: boolean;
  dialog: ReactNode;
} {
  const repoState = useRepoStore((state) => state.repoState);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<BlockReason>("conflict");

  const blocked = isWriteOpBlocked(repoState);

  const guard = useCallback((): boolean => {
    if (!isWriteOpBlocked(repoState)) {
      return true;
    }
    setReason(hasUnresolvedConflicts(repoState) ? "conflict" : "inProgress");
    setOpen(true);
    return false;
  }, [repoState]);

  const dialog = <ConflictBlockedDialog open={open} onOpenChange={setOpen} reason={reason} />;

  return { guard, blocked, dialog };
}
