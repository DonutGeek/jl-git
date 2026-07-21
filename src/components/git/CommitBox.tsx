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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import { cn } from "@/lib/utils";

import { generateCommitMessage, toastAiFailure } from "@/services/ai";
import { getCommitMessage } from "@/services/git";
import { useAppPrefsStore } from "@/store/useAppPrefsStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsDrawerStore } from "@/store/useSettingsDrawerStore";

import { toUserMessage } from "@/types/error";
import { GitCommitSummary, GitStatusEntry } from "@/types/git";
import { isStagedChangeEntry } from "@/utils/gitConflict";
import { hasConfiguredGitIdentity } from "@/utils/gitIdentity";

/** 提交信息历史展示最近几条标题；选择后填入完整提交文案。 */
const COMMIT_MESSAGE_HISTORY_LIMIT = 5;
const HISTORY_POPOVER_WIDTH = 320;
const HISTORY_POPOVER_MAX_HEIGHT = 200;
const HISTORY_VIEWPORT_PADDING = 12;

interface CommitMessageHistoryItem {
  id: string;
  preview: string;
  message: string;
  complete: boolean;
}

async function loadFullCommitMessage(
  repoPath: string,
  commit: GitCommitSummary,
): Promise<CommitMessageHistoryItem> {
  const fallback = {
    id: commit.id,
    preview: commit.subject.trim(),
    message: commit.subject.trim(),
    complete: false,
  };

  try {
    const result = await getCommitMessage(repoPath, commit.id);
    const message = result.message;

    return message
      ? {
          id: commit.id,
          preview: commit.subject.trim(),
          message,
          complete: true,
        }
      : fallback;
  } catch {
    console.warn("[CommitBox] Failed to load full commit message", commit.id);
    return fallback;
  }
}

/** 已暂存（含未 demote 的冲突）；提交仍由 conflictCount 拦截 */
function isStagedEntry(
  entry: GitStatusEntry,
  demotedConflictPaths: ReadonlySet<string>,
): boolean {
  return isStagedChangeEntry(entry, demotedConflictPaths);
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
  const conflictCount = useRepoStore((state) => state.repoState?.conflictCount ?? 0);
  const sequencerInProgress = useRepoStore((state) =>
    Boolean(state.repoState?.merging),
  );
  const demotedConflictPaths = useRepoStore((state) => state.demotedConflictPaths);
  const defaultPushAfterCommit = useAppPrefsStore((state) => state.pushAfterCommit);
  const openSettingsDrawer = useSettingsDrawerStore((state) => state.openDrawer);

  const [pushAfterCommit, setPushAfterCommit] = useState(defaultPushAfterCommit);
  const [busy, setBusy] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const hasApiKey = useHasAgentApiKey();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPosition, setHistoryPosition] = useState({
    left: 0,
    top: 0,
    maxHeight: HISTORY_POPOVER_MAX_HEIGHT,
  });
  const [commitMessageHistory, setCommitMessageHistory] = useState<CommitMessageHistoryItem[]>([]);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setPushAfterCommit(defaultPushAfterCommit);
  }, [defaultPushAfterCommit]);

  const demotedSet = useMemo(
    () => new Set(demotedConflictPaths),
    [demotedConflictPaths],
  );
  const stagedCount =
    status?.entries.filter((entry) => isStagedEntry(entry, demotedSet)).length ?? 0;
  const working = loading || busy;
  const canGenerateCommitMessage = hasApiKey && stagedCount > 0 && !working;
  const hasIdentity = hasConfiguredGitIdentity(identity);
  const isDetached = Boolean(status?.detached);
  // 待提交为空不可提交；合并进行中且冲突已清时可提交以结束合并；无 Git 身份不可提交
  // 分离 HEAD（如检出标签）禁止普通提交，避免提交悬空难找回
  const canCommit =
    !working &&
    hasIdentity &&
    !isDetached &&
    conflictCount === 0 &&
    commitMessage.trim().length > 0 &&
    (stagedCount > 0 || sequencerInProgress);
  const branchLabel = status?.branch ?? "";
  const commitButtonLabel = isDetached
    ? t("repo.commitDetachedDisabled")
    : t("repo.commitTo", { branch: branchLabel || "—" });
  const commitDisabledReason = !hasIdentity
    ? t("repo.errors.noGitIdentity")
    : isDetached
      ? t("repo.commitDetachedHint")
      : null;
  const ahead = status?.ahead ?? 0;
  const hasUnpushed = ahead > 0;
  const tipCommit = hasUnpushed ? (commits[0] ?? null) : null;
  const commitMessageHistoryCandidates = useMemo(() => {
    const seen = new Set<string>();
    return commits
      .flatMap((item) => {
        const message = item.subject.trim();
        if (!message || seen.has(item.id)) {
          return [];
        }
        seen.add(item.id);
        return [item];
      })
      .slice(0, COMMIT_MESSAGE_HISTORY_LIMIT);
  }, [commits]);

  useEffect(() => {
    const fallback = commitMessageHistoryCandidates.map((commit) => ({
      id: commit.id,
      preview: commit.subject.trim(),
      message: commit.subject.trim(),
      complete: false,
    }));
    setCommitMessageHistory(fallback);

    if (!repoPath || commitMessageHistoryCandidates.length === 0) {
      return;
    }

    let active = true;
    void Promise.all(
      commitMessageHistoryCandidates.map((commit) => loadFullCommitMessage(repoPath, commit)),
    ).then((items) => {
      if (!active) {
        return;
      }
      setCommitMessageHistory(items);
    });

    return () => {
      active = false;
    };
  }, [commitMessageHistoryCandidates, repoPath]);

  function updateHistoryPosition(): void {
    const rect = messageInputRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    // 右侧放得下则贴输入框右侧；否则放到左侧，避免贴边后预览再被裁切
    const spaceRight =
      window.innerWidth - HISTORY_VIEWPORT_PADDING - (rect.right + 8);
    const preferRight = spaceRight >= HISTORY_POPOVER_WIDTH;
    const left = preferRight
      ? rect.right + 8
      : Math.max(
          HISTORY_VIEWPORT_PADDING,
          rect.left - HISTORY_POPOVER_WIDTH - 8,
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

  async function fillCommitMessage(item: CommitMessageHistoryItem): Promise<void> {
    let message = item.message;
    if (!item.complete && repoPath) {
      try {
        const result = await getCommitMessage(repoPath, item.id);
        message = result.message;
      } catch {
        // 详情读取失败时仍可安全回填列表已有标题。
      }
    }

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
    if (!hasConfiguredGitIdentity(identity)) {
      toast.error(t("repo.errors.noGitIdentity"), {
        action: {
          label: t("repo.goToGitSettings"),
          onClick: () => openSettingsDrawer("git"),
        },
      });
      return;
    }

    if (status?.detached) {
      toast.error(t("repo.commitDetachedHint"));
      return;
    }

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
    if (!repoPath || !canGenerateCommitMessage) {
      return;
    }

    setBusy(true);
    setIsGenerating(true);
    // 先让出一帧，避免点击时同步卡死 UI；大 diff 已在 Rust 侧流式截断
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    try {
      const message = await generateCommitMessage(repoPath, locale);
      setCommitMessage(message);
      toast.success(t("repo.aiCommitGenerated"));
      messageInputRef.current?.focus();
    } catch (error) {
      toastAiFailure(error, t("ai.errors.requestFailed"));
    } finally {
      setIsGenerating(false);
      setBusy(false);
    }
  }

  const identityLabel =
    hasIdentity
      ? t("repo.gitIdentity", {
          name: identity?.name ?? identity?.email ?? "",
        })
      : t("repo.gitIdentityDefault");

  function openGitSettings(): void {
    openSettingsDrawer("git");
  }

  const historyPopover =
    historyOpen && commitMessageHistory.length > 0
      ? createPortal(
          <div
            role="dialog"
            aria-label={t("repo.commitMessageHistory")}
            className="border-border bg-popover text-popover-foreground fixed z-50 w-80 overflow-hidden rounded-md border"
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
            <div
              className="min-h-0 w-full overflow-x-hidden overflow-y-auto"
              style={{ maxHeight: Math.max(88, historyPosition.maxHeight - 32) }}
            >
              <ul
                className="w-full min-w-0 overflow-hidden p-1"
                role="listbox"
                aria-label={t("repo.commitMessageHistory")}
              >
                {commitMessageHistory.map((item) => (
                  <li key={item.id} className="w-full min-w-0 overflow-hidden">
                    <button
                      type="button"
                      role="option"
                      className="hover:bg-accent focus-visible:ring-ring flex w-full min-w-0 cursor-pointer overflow-hidden rounded-sm px-2 py-1.5 text-left text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void fillCommitMessage(item)}
                    >
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                            {item.preview}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="left"
                          align="center"
                          sideOffset={8}
                          collisionPadding={12}
                          className="max-w-80 text-left text-wrap whitespace-pre-wrap break-words"
                        >
                          {item.message}
                        </TooltipContent>
                      </Tooltip>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
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
            {/* disabled 按钮需包一层，否则无法悬停展示原因 */}
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                aria-label={
                  !hasApiKey
                    ? t("common.aiApiKeyRequired")
                    : isGenerating
                      ? t("repo.generatingCommitMessage")
                      : t("repo.generateCommitMessage")
                }
                disabled={!canGenerateCommitMessage}
                onClick={() => void handleGenerateCommitMessage()}
              >
                {isGenerating ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="size-3.5" aria-hidden="true" />
                )}
                <span>{isGenerating ? t("repo.aiGenerating") : t("repo.aiGenerate")}</span>
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

      <div className="relative min-h-0 flex-1">
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
          placeholder=""
          className="h-full min-h-0 resize-none px-2.5 py-1.5 text-xs md:text-xs"
          disabled={working}
        />
        {commitMessage.trim().length === 0 ? (
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1.5 left-2.5 text-xs"
          >
            {t("repo.commitMessagePlaceholder")}
          </span>
        ) : null}
      </div>

      <div className="shrink-0 space-y-2">
        <div className="flex items-center gap-1.5">
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex cursor-pointer rounded-md focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none"
                aria-label={
                  hasIdentity ? identityLabel : t("repo.errors.noGitIdentity")
                }
                onClick={openGitSettings}
              >
                <GitIdentityAvatar
                  name={identity?.name ?? null}
                  email={identity?.email ?? null}
                  label={identityLabel}
                  shape="rounded"
                  className="size-7 text-[10px]"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {hasIdentity ? identityLabel : t("repo.errors.noGitIdentity")}
            </TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span className="inline-flex min-w-0 flex-1">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 w-full min-w-0 px-2 text-xs"
                  onClick={() => void handleCommit()}
                  disabled={!canCommit}
                >
                  {commitButtonLabel}
                </Button>
              </span>
            </TooltipTrigger>
            {commitDisabledReason ? (
              <TooltipContent>{commitDisabledReason}</TooltipContent>
            ) : null}
          </Tooltip>
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
