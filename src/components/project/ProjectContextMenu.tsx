import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  ExternalLink,
  FolderOpen,
  Globe,
  Link,
  SquarePen,
  Terminal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ContextMenuSubTrigger } from "@/components/common/ContextMenuSubTrigger";
import { ButtonLoadingContent } from "@/components/common/ButtonLoadingContent";
import { ProjectSettingsDialog } from "@/components/project/ProjectSettingsDialog";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

import { gitService, openPrimaryRemoteInBrowser, pickPrimaryRemoteUrl } from "@/services/git";
import { systemOpenService } from "@/services/system/system.open";
import { detectAppOs } from "@/services/window/windowChrome";
import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";
import { copyToClipboard } from "@/utils/clipboard";
import { useContextMenuOpen, withContextMenuHighlight } from "@/utils/contextMenuHighlight";
import { deferUi } from "@/utils/deferUi";
import { revealInFileManagerLabel } from "@/utils/platformLabels";

interface ProjectContextMenuProps {
  project: Project;
  onOpenProject: (projectId: string) => void;
  disabled?: boolean;
  /** 菜单打开时选中该项 */
  onMenuOpen?: () => void;
  /** 从应用移除成功后回调 */
  onRemoved?: () => void;
  children: ReactElement;
}

/** 最近与分组列表共用的仓库右键操作。 */
export function ProjectContextMenu({
  project,
  onOpenProject,
  disabled = false,
  onMenuOpen,
  onRemoved,
  children,
}: ProjectContextMenuProps) {
  const { t } = useTranslation();
  const removeProject = useProjectStore((state) => state.removeProject);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { menuOpen, onOpenChange } = useContextMenuOpen(onMenuOpen);
  const revealLabel = revealInFileManagerLabel(detectAppOs(), t);

  async function handleCopyRemote(): Promise<void> {
    try {
      const remoteUrl = pickPrimaryRemoteUrl(await gitService.listRemotes(project.path));
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

  async function runSystemOpen(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handleOpenRemoteInBrowser(): Promise<void> {
    try {
      const result = await openPrimaryRemoteInBrowser(project.path);
      if (result === "empty") {
        toast.message(t("repo.tabCopyRemoteEmpty"));
        return;
      }
      if (result === "unsupported") {
        toast.error(t("repo.openRemoteUnsupported"));
        return;
      }
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
      toast.success(t("projectManager.deleteProjectSuccess", { name: project.name }));
      setDeleteOpen(false);
      onRemoved?.();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ContextMenu onOpenChange={onOpenChange}>
        <ContextMenuTrigger asChild>
          {withContextMenuHighlight(children, menuOpen)}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-48">
          <ContextMenuItem disabled={disabled} onSelect={() => onOpenProject(project.id)}>
            <FolderOpen aria-hidden="true" />
            {t("projectManager.openProject")}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={disabled}
            onSelect={() => deferUi(() => setSettingsOpen(true))}
          >
            <SquarePen aria-hidden="true" />
            {t("projectManager.manageEditAction")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* 复制类操作有共性，收进子菜单 */}
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={disabled}>
              <Copy aria-hidden="true" />
              {t("common.copy")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-44">
              <ContextMenuItem disabled={disabled} onSelect={() => void handleCopyRemote()}>
                <Link aria-hidden="true" />
                {t("projectManager.copyRemote")}
              </ContextMenuItem>
              <ContextMenuItem disabled={disabled} onSelect={() => void handleCopyPath()}>
                <Copy aria-hidden="true" />
                {t("projectManager.copyLocalPath")}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          {/* 系统打开：收入「打开方式」子菜单（见 ui-guidelines §2.3） */}
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={disabled}>
              <ExternalLink aria-hidden="true" />
              {t("repo.openVia")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-44">
              <ContextMenuItem
                disabled={disabled}
                onSelect={() =>
                  void runSystemOpen(() => systemOpenService.revealInFileManager(project.path))
                }
              >
                <FolderOpen aria-hidden="true" />
                {revealLabel}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={disabled}
                onSelect={() =>
                  void runSystemOpen(() => systemOpenService.openInEditor(project.path))
                }
              >
                <ExternalLink aria-hidden="true" />
                {t("repo.openInEditor")}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={disabled}
                onSelect={() =>
                  void runSystemOpen(() => systemOpenService.openTerminal(project.path))
                }
              >
                <Terminal aria-hidden="true" />
                {t("repo.openInTerminal")}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={disabled}
                onSelect={() => void handleOpenRemoteInBrowser()}
              >
                <Globe aria-hidden="true" />
                {t("repo.openRemoteInBrowser")}
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

      <ProjectSettingsDialog project={project} open={settingsOpen} onOpenChange={setSettingsOpen} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AppAlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projectManager.deleteProjectTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("projectManager.deleteProjectQuestion", { name: project.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              <ButtonLoadingContent loading={deleting} loadingLabel={t("common.loading")}>
                {t("projectManager.deleteProject")}
              </ButtonLoadingContent>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </>
  );
}
