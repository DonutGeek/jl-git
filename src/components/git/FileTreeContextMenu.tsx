import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Clock3,
  ExternalLink,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Pencil,
  Terminal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ContextMenuSubTrigger } from "@/components/common/ContextMenuSubTrigger";
import { ButtonLoadingContent } from "@/components/common/ButtonLoadingContent";
import {
  AppAlertDialogContent,
  AppAlertDialogHeader,
  AppDialogContent,
} from "@/components/common/AppDialogContent";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { useWindowChromeLayout } from "@/hooks/useWindowChromeLayout";
import { useProjectStore } from "@/store/useProjectStore";

import { gitService } from "@/services/git";
import { systemOpenService } from "@/services/system/system.open";
import { openFileHistoryWindow } from "@/services/window/historyWindows";

import { toUserMessage } from "@/types/error";
import type { FsEntry } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import { useContextMenuOpen, withContextMenuHighlight } from "@/utils/contextMenuHighlight";
import { deferUi } from "@/utils/deferUi";
import { revealInFileManagerLabel } from "@/utils/platformLabels";
import { toAbsoluteRepoFilePath } from "@/utils/repoFilePath";

export type FileTreeMutation =
  | { type: "delete"; path: string }
  | { type: "rename"; from: string; to: string }
  | { type: "create"; path: string; parentPath: string; isDir: boolean };

type NameDialogKind = "rename" | "createDir" | "createFile";

interface FileTreeContextMenuProps {
  entry: FsEntry;
  repoPath: string;
  disabled?: boolean;
  onMenuOpen?: () => void;
  /** 删除 / 重命名 / 新建成功后刷新目录树与 status */
  onMutated?: (mutation: FileTreeMutation) => void;
  children: ReactElement;
}

function isValidBasename(name: string): boolean {
  const next = name.trim();
  return (
    next.length > 0 && next !== "." && next !== ".." && !next.includes("/") && !next.includes("\\")
  );
}

/** 目录树节点右键：主操作 → 编辑 → 复制 → 系统打开 → 危险（ui-guidelines §2.3） */
export function FileTreeContextMenu({
  entry,
  repoPath,
  disabled = false,
  onMenuOpen,
  onMutated,
  children,
}: FileTreeContextMenuProps) {
  const { t } = useTranslation();
  const { os } = useWindowChromeLayout();
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState<NameDialogKind | null>(null);
  const [nameValue, setNameValue] = useState(entry.name);
  const { menuOpen, onOpenChange } = useContextMenuOpen(onMenuOpen);

  const absolutePath = toAbsoluteRepoFilePath(repoPath, entry.path, os);
  /** 终端需目录：文件夹用自身路径，文件用所在目录 */
  const terminalPath = entry.isDir
    ? absolutePath
    : absolutePath.replace(/[/\\][^/\\]+$/, "") || repoPath;
  const revealLabel = revealInFileManagerLabel(os, t);
  const protectedEntry = entry.name === ".git" || entry.path === ".git";

  async function runAction(action: () => Promise<void>): Promise<void> {
    if (busy || disabled) {
      return;
    }
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(text: string, successKey: string): Promise<void> {
    try {
      await copyToClipboard(text);
      toast.success(t(successKey));
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function handleOpenHistory(): Promise<void> {
    const store = useProjectStore.getState();
    let project = store.projects.find((item) => item.path === repoPath);
    if (!project) {
      const projects = await store.loadProjects();
      project = projects.find((item) => item.path === repoPath);
    }
    if (!project) {
      throw new Error(t("repo.diffOpenFileHistoryFailed"));
    }
    await openFileHistoryWindow({
      projectId: project.id,
      filePath: entry.path,
    });
  }

  async function handleDelete(): Promise<void> {
    if (busy || protectedEntry) {
      return;
    }
    setBusy(true);
    try {
      await gitService.removePath(repoPath, entry.path);
      toast.success(
        t(entry.isDir ? "repo.fileTreeDeleteDirSuccess" : "repo.fileTreeDeleteFileSuccess", {
          name: entry.name,
        }),
      );
      setDeleteOpen(false);
      onMutated?.({ type: "delete", path: entry.path });
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleNameSubmit(): Promise<void> {
    if (busy || !nameDialog) {
      return;
    }
    const next = nameValue.trim();
    if (!isValidBasename(next)) {
      toast.error(t("repo.fileTreeRenameInvalid"));
      return;
    }

    if (nameDialog === "rename") {
      if (protectedEntry || next === entry.name) {
        setNameDialog(null);
        return;
      }
      setBusy(true);
      try {
        const result = await gitService.renamePath(repoPath, entry.path, next);
        toast.success(t("repo.fileTreeRenameSuccess", { name: next }));
        setNameDialog(null);
        onMutated?.({ type: "rename", from: entry.path, to: result.path });
      } catch (error) {
        toast.error(toUserMessage(error));
      } finally {
        setBusy(false);
      }
      return;
    }

    const isDir = nameDialog === "createDir";
    setBusy(true);
    try {
      const result = await gitService.createPath(repoPath, entry.path, next, isDir);
      toast.success(
        t(isDir ? "repo.fileTreeCreateDirSuccess" : "repo.fileTreeCreateFileSuccess", {
          name: next,
        }),
      );
      setNameDialog(null);
      onMutated?.({
        type: "create",
        path: result.path,
        parentPath: entry.path,
        isDir: result.isDir,
      });
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const nameDialogTitle =
    nameDialog === "createDir"
      ? t("repo.fileTreeCreateDirTitle")
      : nameDialog === "createFile"
        ? t("repo.fileTreeCreateFileTitle")
        : t("repo.fileTreeRenameTitle");

  const nameDialogAction =
    nameDialog === "rename" ? t("repo.fileTreeRenameAction") : t("repo.fileTreeCreateAction");

  const nameSubmitDisabled =
    busy ||
    !isValidBasename(nameValue) ||
    (nameDialog === "rename" && nameValue.trim() === entry.name);

  return (
    <>
      <ContextMenu onOpenChange={onOpenChange}>
        <ContextMenuTrigger asChild>
          {withContextMenuHighlight(children, menuOpen)}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-52">
          {/* 1 主操作：新建空目录 → 新文件 */}
          {entry.isDir ? (
            <>
              <ContextMenuItem
                disabled={disabled || busy || protectedEntry}
                onSelect={() =>
                  deferUi(() => {
                    setNameValue(t("repo.fileTreeNewFolderName"));
                    setNameDialog("createDir");
                  })
                }
              >
                <FolderPlus aria-hidden="true" />
                {t("repo.fileTreeCreateDir")}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={disabled || busy || protectedEntry}
                onSelect={() =>
                  deferUi(() => {
                    setNameValue(t("repo.fileTreeNewFileName"));
                    setNameDialog("createFile");
                  })
                }
              >
                <FilePlus aria-hidden="true" />
                {t("repo.fileTreeCreateFile")}
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          ) : null}

          {/* 2 编辑 */}
          <ContextMenuItem
            disabled={disabled || busy || protectedEntry}
            onSelect={() =>
              deferUi(() => {
                setNameValue(entry.name);
                setNameDialog("rename");
              })
            }
          >
            <Pencil aria-hidden="true" />
            {t("repo.fileTreeRename")}
          </ContextMenuItem>

          <ContextMenuItem
            disabled={disabled || busy}
            onSelect={() => void runAction(handleOpenHistory)}
          >
            <Clock3 aria-hidden="true" />
            {t("repo.viewFileHistory")}
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* 3 复制 */}
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={disabled || busy}>
              <Copy aria-hidden="true" />
              {t("common.copy")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-44">
              <ContextMenuItem
                disabled={disabled || busy}
                onSelect={() => void handleCopy(entry.path, "repo.copyRepoPathSuccess")}
              >
                <Copy aria-hidden="true" />
                {t("repo.copyRepoRelativePath")}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={disabled || busy}
                onSelect={() => void handleCopy(absolutePath, "repo.copyAbsolutePathSuccess")}
              >
                <Copy aria-hidden="true" />
                {t("repo.copyAbsolutePath")}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          {/* 5 系统打开：收入「打开方式」子菜单 */}
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={disabled || busy}>
              <ExternalLink aria-hidden="true" />
              {t("repo.openVia")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-44">
              <ContextMenuItem
                disabled={disabled || busy}
                onSelect={() =>
                  void runAction(() => systemOpenService.revealInFileManager(absolutePath))
                }
              >
                <FolderOpen aria-hidden="true" />
                {revealLabel}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={disabled || busy}
                onSelect={() => void runAction(() => systemOpenService.openInEditor(absolutePath))}
              >
                <ExternalLink aria-hidden="true" />
                {t("repo.openInEditor")}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={disabled || busy}
                onSelect={() => void runAction(() => systemOpenService.openTerminal(terminalPath))}
              >
                <Terminal aria-hidden="true" />
                {t("repo.openInTerminal")}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          {/* 7 危险置底 */}
          <ContextMenuItem
            variant="destructive"
            disabled={disabled || busy || protectedEntry}
            onSelect={() => deferUi(() => setDeleteOpen(true))}
          >
            <Trash2 aria-hidden="true" />
            {t("repo.fileTreeDelete")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AppAlertDialogContent>
          <AppAlertDialogHeader>
            <AlertDialogTitle>{t("repo.fileTreeDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                entry.isDir ? "repo.fileTreeDeleteDirQuestion" : "repo.fileTreeDeleteFileQuestion",
                { name: entry.name },
              )}
            </AlertDialogDescription>
          </AppAlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              <ButtonLoadingContent loading={busy} loadingLabel={t("common.loading")}>
                {t("repo.fileTreeDelete")}
              </ButtonLoadingContent>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>

      <Dialog
        open={nameDialog != null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setNameDialog(null);
          }
        }}
      >
        <AppDialogContent>
          <DialogHeader>
            <DialogTitle>{nameDialogTitle}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleNameSubmit();
            }}
          >
            <Field>
              <FieldLabel className="sr-only" htmlFor="file-tree-name">
                {nameDialogTitle}
              </FieldLabel>
              <Input
                id="file-tree-name"
                value={nameValue}
                onChange={(event) => setNameValue(event.target.value)}
                disabled={busy}
                autoFocus
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setNameDialog(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={nameSubmitDisabled}>
                {busy ? <Spinner className="size-3.5" /> : null}
                {nameDialogAction}
              </Button>
            </DialogFooter>
          </form>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
