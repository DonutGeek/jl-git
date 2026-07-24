import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  FolderOpen,
  Link,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ProjectSettingsDialog } from "@/components/project/ProjectSettingsDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

import { gitService, pickPrimaryRemoteUrl } from "@/services/git";
import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";
import { copyToClipboard } from "@/utils/clipboard";
import { deferUi } from "@/utils/deferUi";

interface ProjectContextMenuProps {
  project: Project;
  onOpenProject: (projectId: string) => void;
  disabled?: boolean;
  children: ReactElement;
}

/** 最近与分组列表共用的仓库右键操作。 */
export function ProjectContextMenu({
  project,
  onOpenProject,
  disabled = false,
  children,
}: ProjectContextMenuProps) {
  const { t } = useTranslation();
  const removeProject = useProjectStore((state) => state.removeProject);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleCopyRemote(): Promise<void> {
    try {
      const remoteUrl = pickPrimaryRemoteUrl(
        await gitService.listRemotes(project.path),
      );
      if (!remoteUrl) {
        toast.message(t("repo.tabCopyRemoteEmpty"));
        return;
      }
      await copyToClipboard(remoteUrl);
      toast.success(t("repo.tabCopyRemoteSuccess"));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handleCopyPath(): Promise<void> {
    try {
      await copyToClipboard(project.path);
      toast.success(t("repo.tabCopyPathSuccess"));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handleDelete(): Promise<void> {
    if (deleting) {
      return;
    }
    setDeleting(true);
    try {
      await removeProject(project.id);
      toast.success(
        t("projectManager.deleteProjectSuccess", { name: project.name }),
      );
      setDeleteOpen(false);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="min-w-48">
          <ContextMenuItem
            disabled={disabled}
            onSelect={() => onOpenProject(project.id)}
          >
            <FolderOpen aria-hidden="true" />
            {t("projectManager.openProject")}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={disabled}
            onSelect={() => deferUi(() => setSettingsOpen(true))}
          >
            <Settings2 aria-hidden="true" />
            {t("projectManager.projectSettings")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* 复制类操作有共性，收进子菜单 */}
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={disabled}>
              <Copy aria-hidden="true" />
              {t("common.copy")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-44">
              <ContextMenuItem
                disabled={disabled}
                onSelect={() => void handleCopyRemote()}
              >
                <Link aria-hidden="true" />
                {t("projectManager.copyRemote")}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={disabled}
                onSelect={() => void handleCopyPath()}
              >
                <Copy aria-hidden="true" />
                {t("projectManager.copyLocalPath")}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            disabled={disabled}
            onSelect={() => deferUi(() => setDeleteOpen(true))}
          >
            <Trash2 aria-hidden="true" />
            {t("projectManager.deleteProject")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("projectManager.deleteProjectTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("projectManager.deleteProjectQuestion", { name: project.name })}
              <span className="mt-2 block">
                {t("projectManager.deleteProjectHint")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? t("common.loading") : t("projectManager.deleteProject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
