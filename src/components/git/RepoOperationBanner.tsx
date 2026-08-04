import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";

function getOperationLabel(kind: string, translate: (key: string) => string): string {
  if (kind === "rebase") {
    return translate("repo.operationRebase");
  }
  if (kind === "cherryPick") {
    return translate("repo.operationCherryPick");
  }
  return translate("repo.operationMerge");
}

/** 仓库仍有 Git 序列操作时显示的常驻状态条。 */
export function RepoOperationBanner() {
  const { t } = useTranslation();
  const repoState = useRepoStore((state) => state.repoState);
  const abortOperation = useRepoStore((state) => state.abortOperation);
  const [aborting, setAborting] = useState(false);

  if (!repoState?.merging) {
    return null;
  }

  const operationLabel = getOperationLabel(repoState.kind, t);

  async function handleAbort(): Promise<void> {
    setAborting(true);
    try {
      await abortOperation();
      toast.success(t("repo.abortOperationSuccess"));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setAborting(false);
    }
  }

  return (
    <Alert className="min-h-8 rounded-none border-x-0 border-warning/35 bg-warning/15 px-3 py-1 text-xs text-warning-foreground">
      <TriangleAlert aria-hidden="true" />
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">
          {t("repo.operationBanner", { operation: operationLabel })}
          {" · "}
          {repoState.conflictCount > 0
            ? t("repo.operationBannerConflict", { count: repoState.conflictCount })
            : t("repo.operationBannerReady")}
        </span>
        <Button
          type="button"
          variant="link"
          size="sm"
          disabled={aborting}
          className="h-auto shrink-0 px-0 text-xs text-warning-foreground underline-offset-4 hover:text-warning-foreground"
          onClick={() => void handleAbort()}
        >
          {aborting ? t("repo.abortOperationRunning") : t("repo.abortOperation")}
        </Button>
      </div>
    </Alert>
  );
}
