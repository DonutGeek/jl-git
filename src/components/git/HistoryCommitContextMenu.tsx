import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Copy, FileDown, Hash, PencilLine, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppAlertDialogContent, AppDialogContent } from "@/components/common/AppDialogContent";
import { ContextMenuSubTrigger } from "@/components/common/ContextMenuSubTrigger";
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
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import { generateCommitMessage, toastAiFailure } from "@/services/ai";
import { gitService } from "@/services/git";
import { exportTextFile } from "@/services/system/system.write";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsDrawerStore } from "@/store/useSettingsDrawerStore";

import { toUserMessage } from "@/types/error";
import type { GitCommitSummary } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import { buildCommitMessageExportFileName } from "@/utils/commitExportFileName";
import {
  CONTEXT_MENU_HISTORY_HIGHLIGHT_CLASS,
  useContextMenuOpen,
  withContextMenuHighlight,
} from "@/utils/contextMenuHighlight";
import { deferUi } from "@/utils/deferUi";
import { isWriteOpBlocked } from "@/utils/repoOperationGuard";

interface HistoryCommitContextMenuProps {
  commit: GitCommitSummary;
  /** 是否为当前 HEAD（仅 HEAD 可改提交信息） */
  isHead: boolean;
  /** 已推送到远端时改写需二次确认 */
  alreadyPushed: boolean;
  /** 菜单打开时选中该提交 */
  onMenuOpen?: () => void;
  children: ReactElement;
}

/** 历史列表提交行右键菜单 */
export function HistoryCommitContextMenu({
  commit,
  isHead,
  alreadyPushed,
  onMenuOpen,
  children,
}: HistoryCommitContextMenuProps) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const repoPath = useRepoStore((state) => state.repoPath);
  const repoState = useRepoStore((state) => state.repoState);
  const amendMessage = useRepoStore((state) => state.amendMessage);
  const hasApiKey = useHasAgentApiKey();
  const openSettingsDrawer = useSettingsDrawerStore((state) => state.openDrawer);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmPushOpen, setConfirmPushOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const writeBlocked = isWriteOpBlocked(repoState);
  const { menuOpen, onOpenChange } = useContextMenuOpen(onMenuOpen);
  const canGenerate = Boolean(repoPath) && hasApiKey && !loadingMessage && !saving && !isGenerating;

  async function loadFullMessage(): Promise<string> {
    if (!repoPath) {
      throw new Error(t("repo.errors.noRepo"));
    }
    const result = await gitService.getCommitMessage(repoPath, commit.id);
    return result.message.trim() || commit.subject.trim();
  }

  async function handleCopySha(): Promise<void> {
    try {
      await copyToClipboard(commit.id);
      toast.success(t("repo.copyShaSuccess"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("repo.copyFailed"));
    }
  }

  async function handleCopyMessage(): Promise<void> {
    try {
      const full = await loadFullMessage();
      await copyToClipboard(full);
      toast.success(t("repo.copyCommitMessageSuccess"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("repo.copyFailed"));
    }
  }

  async function handleExportMessage(): Promise<void> {
    try {
      // 只导出提交说明（标题+正文），不含 Author/Date/改动文件列表
      const full = await loadFullMessage();
      const dest = await exportTextFile({
        contents: `${full}\n`,
        defaultPath: buildCommitMessageExportFileName(commit.subject, commit.shortId),
        filterName: t("repo.exportCommitMessageFilter"),
        extensions: ["txt"],
      });
      if (!dest) {
        return;
      }
      toast.success(t("repo.exportCommitMessageSuccess"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("repo.exportCommitMessageFailed"));
    }
  }

  async function openEditDialog(): Promise<void> {
    setLoadingMessage(true);
    setIsGenerating(false);
    setEditOpen(true);
    try {
      const full = await loadFullMessage();
      setMessage(full);
    } catch (error) {
      setEditOpen(false);
      toast.error(toUserMessage(error));
    } finally {
      setLoadingMessage(false);
    }
  }

  function handleRequestEdit(): void {
    if (!isHead || writeBlocked) {
      return;
    }
    if (alreadyPushed) {
      deferUi(() => setConfirmPushOpen(true));
      return;
    }
    deferUi(() => {
      void openEditDialog();
    });
  }

  async function handleGenerateMessage(): Promise<void> {
    if (!hasApiKey) {
      openSettingsDrawer("ai");
      return;
    }
    if (!repoPath || !canGenerate) {
      return;
    }
    setIsGenerating(true);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    try {
      const next = await generateCommitMessage(repoPath, locale, {
        commitRev: commit.id,
      });
      setMessage(next);
    } catch (error) {
      toastAiFailure(error, t("ai.errors.requestFailed"));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSaveEdit(): Promise<void> {
    if (saving || isGenerating) {
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error(t("repo.errors.emptyMessage"));
      return;
    }
    setSaving(true);
    try {
      await amendMessage(commit.id, trimmed);
      toast.success(t("repo.amendMessageSuccess"));
      setEditOpen(false);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ContextMenu onOpenChange={onOpenChange}>
        <ContextMenuTrigger asChild>
          {withContextMenuHighlight(children, menuOpen, CONTEXT_MENU_HISTORY_HIGHLIGHT_CLASS)}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-48">
          {/* 编辑 → 复制（ui-guidelines §2.3） */}
          <ContextMenuItem disabled={!isHead || writeBlocked} onSelect={() => handleRequestEdit()}>
            <PencilLine aria-hidden="true" />
            {t("repo.amendMessage")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Copy aria-hidden="true" />
              {t("common.copy")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-44">
              <ContextMenuItem onSelect={() => void handleCopySha()}>
                <Hash aria-hidden="true" />
                {t("repo.copySha")}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => void handleCopyMessage()}>
                <Copy aria-hidden="true" />
                {t("repo.copyCommitMessage")}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => void handleExportMessage()}>
                <FileDown aria-hidden="true" />
                {t("repo.exportCommitMessage")}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={confirmPushOpen} onOpenChange={setConfirmPushOpen}>
        <AppAlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("repo.amendMessageTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("repo.amendMessagePushedHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setConfirmPushOpen(false);
                void openEditDialog();
              }}
            >
              {t("repo.amendMessageContinue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <AppDialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{t("repo.amendMessageTitle")}</DialogTitle>
            <DialogDescription>
              {t("repo.amendMessageDescription", { shortId: commit.shortId })}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={loadingMessage || saving || isGenerating}
              className="min-h-40 resize-y pb-10 font-mono text-sm"
              aria-label={t("repo.commitMessage")}
              placeholder={t("repo.commitMessagePlaceholder")}
            />
            <div className="absolute right-2 bottom-2">
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground size-7"
                      aria-label={
                        !hasApiKey
                          ? t("common.aiApiKeyRequired")
                          : isGenerating
                            ? t("repo.generatingCommitMessage")
                            : t("repo.generateCommitMessage")
                      }
                      disabled={!canGenerate && hasApiKey}
                      onClick={() => void handleGenerateMessage()}
                    >
                      {isGenerating ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <Sparkles className="size-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {!hasApiKey
                    ? t("common.aiApiKeyRequired")
                    : isGenerating
                      ? t("repo.generatingCommitMessage")
                      : t("repo.generateCommitMessage")}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving || isGenerating}
              onClick={() => setEditOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={loadingMessage || saving || isGenerating || !message.trim()}
              onClick={() => void handleSaveEdit()}
            >
              {saving ? t("common.loading") : t("repo.amendMessageSave")}
            </Button>
          </DialogFooter>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
