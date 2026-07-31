import { useTranslation } from "react-i18next";

import { AppAlertDialogContent } from "@/components/common/AppDialogContent";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { Project, ProjectRemoteMatch } from "@/types/project";
import { withSoftWrapOpportunities } from "@/utils/softWrapText";

interface ExistingProjectDialogProps {
  open: boolean;
  project: Project | null;
  /** open：主窗打开；view：管理子窗仅查看/定位 */
  action: "open" | "view";
  onOpenChange: (open: boolean) => void;
  onConfirm: (project: Project) => void;
}

/** 本地路径已登记时的确认弹窗 */
export function ExistingProjectDialog({
  open,
  project,
  action,
  onOpenChange,
  onConfirm,
}: ExistingProjectDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AppAlertDialogContent size="md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("openRepo.existingTitle")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{t("openRepo.existingDescription")}</p>
              {project ? (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-foreground">
                  <p className="font-medium">{project.name}</p>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {withSoftWrapOpportunities(project.path)}
                  </p>
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (project) {
                onConfirm(project);
              }
            }}
          >
            {action === "view" ? t("openRepo.existingView") : t("openRepo.existingOpen")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AlertDialog>
  );
}

interface ExistingRemoteCloneDialogProps {
  open: boolean;
  matches: ProjectRemoteMatch[];
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

/** 远程仓库已有本地副本时的警告弹窗（可继续克隆） */
export function ExistingRemoteCloneDialog({
  open,
  matches,
  onOpenChange,
  onContinue,
}: ExistingRemoteCloneDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AppAlertDialogContent size="md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cloneRepo.existingRemoteTitle")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{t("cloneRepo.existingRemoteDescription")}</p>
              <ScrollArea className="max-h-40 rounded-md border border-border">
                <ul className="space-y-2 p-3 text-foreground">
                  {matches.map((item) => (
                    <li key={item.id}>
                      <p className="font-medium">{item.name}</p>
                      <p className="break-words text-xs text-muted-foreground">
                        {withSoftWrapOpportunities(item.path)}
                      </p>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>
            {t("cloneRepo.existingRemoteContinue")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AlertDialog>
  );
}
