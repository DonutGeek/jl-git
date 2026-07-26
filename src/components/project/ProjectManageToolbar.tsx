import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderPlus, GitBranchPlus, RefreshCw } from "lucide-react";

import { CloneRepoPanel } from "@/components/project/CloneRepoPanel";
import { OpenRepoDialog } from "@/components/project/OpenRepoDialog";
import { SettingsTip } from "@/components/settings/SettingsTip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ProjectManageToolbarProps {
  onOpenProject: (projectId: string) => void;
  onProjectsMutated?: () => void;
  onRefreshGit: () => void;
  disabled?: boolean;
}

/** 管理台表格上头：左侧标题，右侧打开 / 克隆 / 刷新 */
export function ProjectManageToolbar({
  onOpenProject,
  onProjectsMutated,
  onRefreshGit,
  disabled = false,
}: ProjectManageToolbarProps) {
  const { t } = useTranslation();
  const [openRepoOpen, setOpenRepoOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="text-sm font-medium tracking-tight">
            {t("projectManager.manageListTitle")}
          </h2>
          <SettingsTip ariaLabel={t("projectManager.manageListTipAria")}>
            {t("projectManager.manageDescription")}
          </SettingsTip>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={disabled}
            onClick={() => setOpenRepoOpen(true)}
          >
            <FolderPlus className="size-3.5" aria-hidden="true" />
            {t("projectManager.open")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={disabled}
            onClick={() => setCloneOpen(true)}
          >
            <GitBranchPlus className="size-3.5" aria-hidden="true" />
            {t("projectManager.clone")}
          </Button>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={disabled}
                aria-label={t("projectManager.manageRefreshGit")}
                onClick={onRefreshGit}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {t("projectManager.manageRefreshGit")}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("projectManager.manageRefreshGitHint")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <OpenRepoDialog
        open={openRepoOpen}
        onOpenChange={setOpenRepoOpen}
        registerOnly
        onRegistered={() => {
          onProjectsMutated?.();
        }}
      />

      <Dialog
        open={cloneOpen}
        onOpenChange={(open) => {
          setCloneOpen(open);
          if (!open) {
            onProjectsMutated?.();
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-border shrink-0 border-b px-6 py-4">
            <DialogTitle>{t("projectManager.clone")}</DialogTitle>
            <DialogDescription>
              {t("projectManager.manageCloneDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
            <CloneRepoPanel
              disabled={disabled}
              onOpenProject={(projectId) => {
                setCloneOpen(false);
                onProjectsMutated?.();
                onOpenProject(projectId);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
