import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import {
  AppWindow,
  ArrowDownToLine,
  ArrowUpFromLine,
  Copy,
  ExternalLink,
  FolderOpen,
  FolderTree,
  History,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { ContextMenuSubTrigger } from "@/components/common/ContextMenuSubTrigger";
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

import { useWindowChromeLayout } from "@/hooks/useWindowChromeLayout";
import { systemOpenService } from "@/services/system/system.open";
import { openFileHistoryWindow } from "@/services/window/historyWindows";
import { useProjectStore } from "@/store/useProjectStore";
import { useRepoNavStore } from "@/store/useRepoNavStore";
import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import type { GitStatusEntry } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import { useContextMenuOpen, withContextMenuHighlight } from "@/utils/contextMenuHighlight";
import { deferUi } from "@/utils/deferUi";
import { isConflictEntry } from "@/utils/gitConflict";
import { revealInFileManagerLabel } from "@/utils/platformLabels";
import { toAbsoluteRepoFilePath } from "@/utils/repoFilePath";

export type ChangeFileSide = "worktree" | "index";

interface ChangeFileContextMenuProps {
  entry: GitStatusEntry;
  side: ChangeFileSide;
  repoPath: string;
  disabled?: boolean;
  /** 菜单打开时选中该行，便于高亮与预览同步 */
  onMenuOpen?: () => void;
  children: ReactElement;
}

function isMissingOnDisk(entry: GitStatusEntry, side: ChangeFileSide): boolean {
  const letter = side === "index" ? entry.indexStatus : entry.worktreeStatus;
  return letter.toUpperCase() === "D";
}

/** 变更 / 待提交文件行右键菜单（分组顺序见 ui-guidelines §2.3） */
export function ChangeFileContextMenu({
  entry,
  side,
  repoPath,
  disabled = false,
  onMenuOpen,
  children,
}: ChangeFileContextMenuProps) {
  const { t } = useTranslation();
  const { os } = useWindowChromeLayout();
  const stage = useRepoStore((state) => state.stage);
  const unstage = useRepoStore((state) => state.unstage);
  const discard = useRepoStore((state) => state.discard);
  const revealInFileTree = useRepoNavStore((state) => state.revealInFileTree);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { menuOpen, onOpenChange } = useContextMenuOpen(onMenuOpen);

  const conflictLocked = isConflictEntry(entry);
  const missing = isMissingOnDisk(entry, side);
  const absolutePath = toAbsoluteRepoFilePath(repoPath, entry.path, os);
  const revealLabel = revealInFileManagerLabel(os, t);

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

  async function handleDiscard(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await discard([entry.path]);
      toast.success(t("repo.discardSuccess", { path: entry.path }));
      setDiscardOpen(false);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function handleOpenHistory(): void {
    const project = useProjectStore.getState().projects.find((item) => item.path === repoPath);
    if (!project) {
      toast.error(t("repo.diffOpenFileHistoryFailed"));
      return;
    }
    void openFileHistoryWindow({
      projectId: project.id,
      filePath: entry.path,
    }).catch((error: unknown) => {
      toast.error(toUserMessage(error) || t("repo.diffOpenFileHistoryFailed"));
    });
  }

  return (
    <>
      <ContextMenu onOpenChange={onOpenChange}>
        <ContextMenuTrigger asChild>
          {withContextMenuHighlight(children, menuOpen)}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-52">
          {/* 1 主操作 */}
          {side === "worktree" ? (
            <ContextMenuItem
              disabled={disabled || busy || conflictLocked}
              onSelect={() => void runAction(() => stage([entry.path]))}
            >
              <ArrowDownToLine aria-hidden="true" />
              {t("repo.addToStaged")}
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              disabled={disabled || busy || conflictLocked}
              onSelect={() => void runAction(() => unstage([entry.path]))}
            >
              <ArrowUpFromLine aria-hidden="true" />
              {t("repo.removeFromStaged")}
            </ContextMenuItem>
          )}

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

          {/* 4 导航 / 历史 */}
          <ContextMenuItem disabled={disabled || busy} onSelect={() => handleOpenHistory()}>
            <History aria-hidden="true" />
            {t("repo.viewFileHistory")}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={disabled || busy}
            onSelect={() => revealInFileTree(entry.path)}
          >
            <FolderTree aria-hidden="true" />
            {t("repo.showInFileTree")}
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* 5 系统打开：访达 → 编辑器 → 默认程序 */}
          <ContextMenuItem
            disabled={disabled || busy || missing}
            onSelect={() =>
              void runAction(() => systemOpenService.revealInFileManager(absolutePath))
            }
          >
            <FolderOpen aria-hidden="true" />
            {revealLabel}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={disabled || busy || missing}
            onSelect={() => void runAction(() => systemOpenService.openInEditor(absolutePath))}
          >
            <ExternalLink aria-hidden="true" />
            {t("repo.openInEditor")}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={disabled || busy || missing}
            onSelect={() =>
              void runAction(() => systemOpenService.openWithDefaultApp(absolutePath))
            }
          >
            <AppWindow aria-hidden="true" />
            {t("repo.openWithDefaultApp")}
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* 7 危险置底 */}
          <ContextMenuItem
            variant="destructive"
            disabled={disabled || busy || conflictLocked}
            onSelect={() => deferUi(() => setDiscardOpen(true))}
          >
            <RotateCcw aria-hidden="true" />
            {t("repo.discardChanges")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AppAlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("repo.discardChangesTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("repo.discardChangesQuestion", { path: entry.path })}
              <span className="mt-2 block">{t("repo.discardChangesHint")}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void handleDiscard();
              }}
            >
              {busy ? t("common.loading") : t("repo.discardChanges")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </>
  );
}
