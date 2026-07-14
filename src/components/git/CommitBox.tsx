import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "dayjs/locale/en";
import { LoaderCircle, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { GitIdentityAvatar } from "@/components/git/GitIdentityAvatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { generateCommitMessage } from "@/services/ai";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { GitStatusEntry } from "@/types/git";

/** 提交信息历史只展示最近几条去重后的 subject */
const COMMIT_MESSAGE_HISTORY_LIMIT = 5;
const HISTORY_POPOVER_WIDTH = 320;
const HISTORY_POPOVER_MAX_HEIGHT = 200;
const HISTORY_VIEWPORT_PADDING = 12;

/** 已暂存：index 侧存在实际变更（非 "." 且非未跟踪的 "?"） */
function isStagedEntry(entry: GitStatusEntry): boolean {
  return entry.indexStatus !== "." && entry.indexStatus !== "?";
}

/** 中栏底部：推送勾选、提交信息、提交按钮、未推送提示 */
export function CommitBox() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  // 跟随应用语言切换相对/绝对日期 locale
  dayjs.locale(locale === "zh-CN" ? "zh-cn" : "en");
  const commitMessage = useRepoStore((state) => state.commitMessage);
  const setCommitMessage = useRepoStore((state) => state.setCommitMessage);
  const loading = useRepoStore((state) => state.loading);
  const commit = useRepoStore((state) => state.commit);
  const undoCommit = useRepoStore((state) => state.undoCommit);
  const push = useRepoStore((state) => state.push);
  const status = useRepoStore((state) => state.status);
  const identity = useRepoStore((state) => state.identity);
  const commits = useRepoStore((state) => state.commits);
  const repoPath = useRepoStore((state) => state.repoPath);

  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPosition, setHistoryPosition] = useState({
    left: 0,
    top: 0,
    maxHeight: HISTORY_POPOVER_MAX_HEIGHT,
  });
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  const stagedCount = status?.entries.filter(isStagedEntry).length ?? 0;
  const working = loading || busy;
  // 待提交为空时不可提交（即使已填提交信息也不高亮）
  const canCommit = !working && commitMessage.trim().length > 0 && stagedCount > 0;
  const branchLabel = status?.branch ?? (status?.detached ? t("repo.detached") : "");
  const ahead = status?.ahead ?? 0;
  const hasUnpushed = ahead > 0;
  const tipCommit = hasUnpushed ? (commits[0] ?? null) : null;
  const commitMessageHistory = useMemo(() => {
    const seen = new Set<string>();
    return commits
      .flatMap((item) => {
        const message = item.subject.trim();
        if (!message || seen.has(message)) {
          return [];
        }
        seen.add(message);
        return [message];
      })
      .slice(0, COMMIT_MESSAGE_HISTORY_LIMIT);
  }, [commits]);

  function updateHistoryPosition(): void {
    const rect = messageInputRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const left = Math.max(
      HISTORY_VIEWPORT_PADDING,
      Math.min(
        rect.right + 8,
        window.innerWidth - HISTORY_POPOVER_WIDTH - HISTORY_VIEWPORT_PADDING,
      ),
    );

    // 可用高度：输入框顶到视口底；不够时上移，避免底部被裁切
    const spaceBelow = window.innerHeight - HISTORY_VIEWPORT_PADDING - rect.top;
    const maxHeight = Math.max(120, Math.min(HISTORY_POPOVER_MAX_HEIGHT, spaceBelow));
    const top = Math.max(
      HISTORY_VIEWPORT_PADDING,
      Math.min(rect.top, window.innerHeight - HISTORY_VIEWPORT_PADDING - maxHeight),
    );

    setHistoryPosition({ left, top, maxHeight });
  }

  function openCommitMessageHistory(): void {
    if (commitMessageHistory.length === 0) {
      return;
    }
    updateHistoryPosition();
    setHistoryOpen(true);
  }

  function fillCommitMessage(message: string): void {
    setCommitMessage(message);
    setHistoryOpen(false);
    messageInputRef.current?.focus();
  }

  useEffect(() => {
    if (!historyOpen) {
      return;
    }

    const handleViewportChange = (): void => updateHistoryPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [historyOpen]);

  async function handleCommit(): Promise<void> {
    setBusy(true);
    try {
      await commit();
      toast.success(t("repo.commitSuccess"));

      if (pushAfterCommit) {
        const needsPublish =
          Boolean(status?.branch) && !status?.detached && !status?.upstream;
        const toastId = toast.loading(
          needsPublish ? t("repo.publishStart") : t("repo.pushStart"),
        );
        try {
          const result = await push(
            needsPublish && status?.branch
              ? {
                  remote: "origin",
                  branch: status.branch,
                  setUpstream: true,
                }
              : undefined,
          );
          const seconds = (result.elapsedMs / 1000).toFixed(3);
          toast.success(
            t(needsPublish ? "repo.publishSuccess" : "repo.pushSuccess", {
              remote: result.remote,
              seconds,
            }),
            { id: toastId },
          );
        } catch (pushError) {
          toast.error(toUserMessage(pushError), { id: toastId });
        }
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo(): Promise<void> {
    if (working) {
      return;
    }
    setBusy(true);
    const toastId = toast.loading(t("repo.undoCommitStart"));
    try {
      const result = await undoCommit();
      const seconds = (result.elapsedMs / 1000).toFixed(3);
      toast.success(t("repo.undoCommitSuccess", { seconds }), { id: toastId });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateCommitMessage(): Promise<void> {
    if (!repoPath || stagedCount === 0 || working) {
      return;
    }

    setBusy(true);
    setIsGenerating(true);
    try {
      const message = await generateCommitMessage(repoPath, locale);
      setCommitMessage(message);
      toast.success(t("repo.aiCommitGenerated"));
      messageInputRef.current?.focus();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setIsGenerating(false);
      setBusy(false);
    }
  }

  const identityLabel =
    identity?.name || identity?.email
      ? t("repo.gitIdentity", {
          name: identity.name ?? identity.email ?? "",
        })
      : t("repo.gitIdentityDefault");

  const historyPopover =
    historyOpen && commitMessageHistory.length > 0
      ? createPortal(
          <div
            role="dialog"
            aria-label={t("repo.commitMessageHistory")}
            className="border-border bg-popover text-popover-foreground fixed z-50 w-80 overflow-hidden rounded-md border shadow-lg"
            style={{
              left: historyPosition.left,
              top: historyPosition.top,
              maxHeight: historyPosition.maxHeight,
            }}
          >
            <div className="border-border flex h-8 shrink-0 items-center justify-between border-b px-2.5">
              <p className="text-xs font-medium">{t("repo.commitMessageHistory")}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-6"
                aria-label={t("repo.commitMessageHistoryClose")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setHistoryOpen(false)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
            <ScrollArea
              className="min-h-0"
              style={{ maxHeight: Math.max(88, historyPosition.maxHeight - 32) }}
            >
              <ul className="p-1" role="listbox" aria-label={t("repo.commitMessageHistory")}>
                {commitMessageHistory.map((message) => (
                  <li key={message}>
                    <button
                      type="button"
                      role="option"
                      className="hover:bg-accent focus-visible:ring-ring flex w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => fillCommitMessage(message)}
                    >
                      <span className="truncate">{message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <label className="text-foreground flex cursor-pointer items-center gap-2 text-xs select-none">
          <input
            type="checkbox"
            className="border-input text-primary focus-visible:ring-ring size-3.5 shrink-0 rounded-sm border accent-primary"
            checked={pushAfterCommit}
            onChange={(event) => setPushAfterCommit(event.target.checked)}
            disabled={working}
          />
          <span>{t("repo.pushToRemote")}</span>
        </label>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              aria-label={
                isGenerating
                  ? t("repo.generatingCommitMessage")
                  : t("repo.generateCommitMessage")
              }
              disabled={working || stagedCount === 0}
              onClick={() => void handleGenerateCommitMessage()}
            >
              {isGenerating ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-3.5" aria-hidden="true" />
              )}
              <span>{isGenerating ? t("repo.aiGenerating") : t("repo.aiGenerate")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isGenerating ? t("repo.generatingCommitMessage") : t("repo.generateCommitMessage")}
          </TooltipContent>
        </Tooltip>
      </div>

      <Textarea
        ref={messageInputRef}
        value={commitMessage}
        onChange={(event) => setCommitMessage(event.target.value)}
        onFocus={openCommitMessageHistory}
        onBlur={() => setHistoryOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setHistoryOpen(false);
          }
        }}
        aria-label={t("repo.commitMessage")}
        placeholder={t("repo.commitMessageRequired")}
        className="min-h-0 flex-1 resize-none px-2.5 py-1.5 text-xs md:text-xs"
        disabled={working}
      />

      <div className="shrink-0 space-y-2">
        <div className="flex items-center gap-1.5">
          <GitIdentityAvatar
            name={identity?.name ?? null}
            email={identity?.email ?? null}
            label={identityLabel}
            className="size-7 rounded-md text-[10px]"
          />
          <Button
            type="button"
            size="sm"
            className="h-7 min-w-0 flex-1 px-2 text-xs"
            onClick={() => void handleCommit()}
            disabled={!canCommit}
          >
            {t("repo.commitTo", { branch: branchLabel })}
          </Button>
        </div>
      </div>

      {tipCommit ? (
        <div
          className={cn(
            "border-border bg-muted/40 flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-2",
          )}
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-muted-foreground text-[11px] leading-none">
              {t("repo.committedAt", {
                date: dayjs(tipCommit.authoredAt).format(
                  locale === "zh-CN" ? "YYYY年M月D日 HH:mm:ss" : "MMM D, YYYY HH:mm:ss",
                ),
              })}
            </p>
            <p className="truncate text-xs font-medium leading-tight" title={tipCommit.subject}>
              {tipCommit.subject}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive h-7 shrink-0 px-2 text-xs"
            disabled={working}
            onClick={() => void handleUndo()}
          >
            {t("repo.undoCommit")}
          </Button>
        </div>
      ) : null}
      {historyPopover}
    </div>
  );
}
