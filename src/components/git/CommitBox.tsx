import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "dayjs/locale/en";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { GitIdentityAvatar } from "@/components/git/GitIdentityAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import { useShortcutAction } from "@/hooks/useShortcutAction";
import { cn } from "@/lib/utils";

import { generateCommitMessage, toastAiFailure } from "@/services/ai";
import { getCommitMessage } from "@/services/git";
import { useAppPrefsStore } from "@/store/useAppPrefsStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsDrawerStore } from "@/store/useSettingsDrawerStore";

import { isAppError, isRecord, toUserMessage } from "@/types/error";
import type { GitCommitSummary, GitStatusEntry } from "@/types/git";
import { isStagedChangeEntry } from "@/utils/gitConflict";
import { hasConfiguredGitIdentity } from "@/utils/gitIdentity";
import { isPushRejectedError, toastPushError } from "@/utils/gitPushError";

/** 提交信息历史展示最近几条标题；选择后填入完整提交文案。 */
const COMMIT_MESSAGE_HISTORY_LIMIT = 5;
const HISTORY_POPOVER_WIDTH = 320;
const HISTORY_POPOVER_MAX_HEIGHT = 200;
const HISTORY_VIEWPORT_PADDING = 12;
const EMPTY_COMMITS: GitCommitSummary[] = [];
const EMPTY_DEMOTED_CONFLICT_PATHS: ReadonlySet<string> = new Set();

function updateRepoTaskPaths(
  current: ReadonlySet<string>,
  repoPath: string,
  active: boolean,
): ReadonlySet<string> {
  const next = new Set(current);
  if (active) {
    next.add(repoPath);
  } else {
    next.delete(repoPath);
  }
  return next;
}

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
function isStagedEntry(entry: GitStatusEntry, demotedConflictPaths: ReadonlySet<string>): boolean {
  return isStagedChangeEntry(entry, demotedConflictPaths);
}

interface CommitBoxProps {
  loadingShell?: boolean;
}

/** 中栏底部：推送勾选、提交信息、提交按钮、未推送提示 */
export function CommitBox({ loadingShell = false }: CommitBoxProps) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  // 跟随应用语言切换相对/绝对日期 locale
  dayjs.locale(locale === "zh-CN" ? "zh-cn" : "en");
  const commitMessage = useRepoStore((state) => (loadingShell ? "" : state.commitMessage));
  const setCommitMessage = useRepoStore((state) => state.setCommitMessage);
  const loading = useRepoStore((state) => loadingShell || state.loading);
  const commit = useRepoStore((state) => state.commit);
  const undoCommit = useRepoStore((state) => state.undoCommit);
  const push = useRepoStore((state) => state.push);
  const pull = useRepoStore((state) => state.pull);
  const fetchRemote = useRepoStore((state) => state.fetch);
  const holdLoading = useRepoStore((state) => state.holdLoading);
  const status = useRepoStore((state) => (loadingShell ? null : state.status));
  const identity = useRepoStore((state) => (loadingShell ? null : state.identity));
  const commits = useRepoStore((state) => (loadingShell ? EMPTY_COMMITS : state.commits));
  const repoPath = useRepoStore((state) => (loadingShell ? null : state.repoPath));
  const conflictCount = useRepoStore((state) =>
    loadingShell ? 0 : (state.repoState?.conflictCount ?? 0),
  );
  const sequencerInProgress = useRepoStore((state) =>
    loadingShell ? false : Boolean(state.repoState?.merging),
  );
  const demotedConflictPaths = useRepoStore((state) =>
    loadingShell ? EMPTY_DEMOTED_CONFLICT_PATHS : state.demotedConflictPaths,
  );
  const defaultPushAfterCommit = useAppPrefsStore((state) => state.pushAfterCommit);
  const openSettingsDrawer = useSettingsDrawerStore((state) => state.openDrawer);

  const [pushAfterCommit, setPushAfterCommit] = useState(defaultPushAfterCommit);
  const [busyRepoPaths, setBusyRepoPaths] = useState<ReadonlySet<string>>(() => new Set());
  const [committingRepoPaths, setCommittingRepoPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [generatingRepoPaths, setGeneratingRepoPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
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

  const busy = repoPath ? busyRepoPaths.has(repoPath) : false;
  const isCommitting = repoPath ? committingRepoPaths.has(repoPath) : false;
  const isGenerating = repoPath ? generatingRepoPaths.has(repoPath) : false;
  const demotedSet = useMemo(() => new Set(demotedConflictPaths), [demotedConflictPaths]);
  const stagedCount =
    status?.entries.filter((entry) => isStagedEntry(entry, demotedSet)).length ?? 0;
  // working：提交/撤销等仓库操作；生成文案用 isGenerating，不禁用「推送到远程」
  const working = loading || busy;
  const canGenerateCommitMessage = hasApiKey && stagedCount > 0 && !working && !isGenerating;
  const hasIdentity = hasConfiguredGitIdentity(identity);
  const isDetached = Boolean(status?.detached);
  // 待提交为空不可提交；合并进行中且冲突已清时可提交以结束合并；无 Git 身份不可提交
  // 分离 HEAD（如检出标签）禁止普通提交，避免提交悬空难找回
  const canCommit =
    !working &&
    !isGenerating &&
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
    const spaceRight = window.innerWidth - HISTORY_VIEWPORT_PADDING - (rect.right + 8);
    const preferRight = spaceRight >= HISTORY_POPOVER_WIDTH;
    const left = preferRight
      ? rect.right + 8
      : Math.max(HISTORY_VIEWPORT_PADDING, rect.left - HISTORY_POPOVER_WIDTH - 8);

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
    const originRepoPath = repoPath;
    if (!originRepoPath) {
      return;
    }
    let message = item.message;
    if (!item.complete) {
      try {
        const result = await getCommitMessage(originRepoPath, item.id);
        message = result.message;
      } catch {
        // 详情读取失败时仍可安全回填列表已有标题。
      }
    }

    if (useRepoStore.getState().repoPath !== originRepoPath) {
      return;
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

    if (!repoPath) {
      toast.error(t("repo.errors.noRepo"));
      return;
    }

    // 锁定发起仓：提交后 await 间隙若切标签，push 仍落原仓
    const originRepoPath = repoPath;
    setBusyRepoPaths((current) => updateRepoTaskPaths(current, originRepoPath, true));
    setCommittingRepoPaths((current) => updateRepoTaskPaths(current, originRepoPath, true));
    const originBranch = status?.branch;
    const originDetached = Boolean(status?.detached);
    const originUpstream = status?.upstream;
    try {
      // 包住提交→推送间隙，避免顶栏「推送」短暂可点造成双重推送
      await holdLoading(async () => {
        await commit();

        if (pushAfterCommit) {
          const needsPublish = Boolean(originBranch) && !originDetached && !originUpstream;
          try {
            await push({
              repoPath: originRepoPath,
              remote: "origin",
              ...(needsPublish && originBranch
                ? { branch: originBranch, setUpstream: true }
                : originBranch
                  ? { branch: originBranch }
                  : {}),
            });
          } catch (pushError) {
            const stillOnOrigin = useRepoStore.getState().repoPath === originRepoPath;
            toastPushError(pushError, {
              onUpdate: stillOnOrigin
                ? () => {
                    void (async () => {
                      try {
                        const pullResult = await pull(
                          originBranch
                            ? { remote: "origin", branch: originBranch }
                            : { remote: "origin" },
                        );
                        if (pullResult.conflict) {
                          toast.error(t("repo.pullConflict"));
                        }
                      } catch (pullError) {
                        toast.error(toUserMessage(pullError));
                      }
                    })();
                  }
                : undefined,
            });
            if (isPushRejectedError(pushError) && stillOnOrigin) {
              void fetchRemote().catch(() => undefined);
            }
          }
        }
      });
    } catch (error) {
      const message = toUserMessage(error);
      const detailLines: string[] = [];
      if (isAppError(error) && error.details && error.details.trim() !== message) {
        detailLines.push(...error.details.trim().split("\n").filter(Boolean).slice(0, 6));
      }
      if (isRecord(error) && error.restoredLintStagedBackup === true) {
        detailLines.push(t("repo.lintStagedRestored"));
      }
      const details = detailLines.length > 0 ? detailLines.join("\n") : undefined;
      toast.error(message, details ? { description: details } : undefined);
    } finally {
      setBusyRepoPaths((current) => updateRepoTaskPaths(current, originRepoPath, false));
      setCommittingRepoPaths((current) => updateRepoTaskPaths(current, originRepoPath, false));
    }
  }

  const handleCommitShortcut = useCallback((): void => {
    if (!working && stagedCount > 0) {
      void handleCommit();
    }
  }, [handleCommit, stagedCount, working]);

  useShortcutAction("commit", handleCommitShortcut, !loadingShell);

  async function handleUndo(): Promise<void> {
    if (working) {
      return;
    }
    if (!repoPath) {
      return;
    }
    const originRepoPath = repoPath;
    setBusyRepoPaths((current) => updateRepoTaskPaths(current, originRepoPath, true));
    try {
      await undoCommit();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusyRepoPaths((current) => updateRepoTaskPaths(current, originRepoPath, false));
    }
  }

  async function handleGenerateCommitMessage(): Promise<void> {
    if (!repoPath || !canGenerateCommitMessage) {
      return;
    }

    const originRepoPath = repoPath;
    setGeneratingRepoPaths((current) => updateRepoTaskPaths(current, originRepoPath, true));
    // 先让出一帧，避免点击时同步卡死 UI；大 diff 已在 Rust 侧流式截断
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    try {
      const message = await generateCommitMessage(originRepoPath, locale);
      if (useRepoStore.getState().repoPath !== originRepoPath) {
        return;
      }
      setCommitMessage(message);
      messageInputRef.current?.focus();
    } catch (error) {
      toastAiFailure(error, t("ai.errors.requestFailed"));
    } finally {
      setGeneratingRepoPaths((current) => updateRepoTaskPaths(current, originRepoPath, false));
    }
  }

  const identityLabel = hasIdentity
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
                className="w-full min-w-0 overflow-hidden px-2 py-1"
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
    <div
      className="flex h-full min-h-0 flex-col gap-2 p-3"
      data-commit-box-loading-shell={loadingShell || undefined}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Field orientation="horizontal" className="w-auto gap-2">
          <Checkbox
            id="commit-push-remote"
            data-repo-git-control="push-after-commit"
            className="size-3.5"
            checked={pushAfterCommit}
            onCheckedChange={(checked) => setPushAfterCommit(checked === true)}
            disabled={working}
          />
          <FieldLabel htmlFor="commit-push-remote" className="text-xs">
            {t("repo.pushToRemote")}
          </FieldLabel>
        </Field>
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
                  <Spinner className="size-3.5" />
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
          data-repo-git-control="commit-message"
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
          disabled={working || isGenerating}
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
                aria-label={hasIdentity ? identityLabel : t("repo.errors.noGitIdentity")}
                onClick={openGitSettings}
              >
                <GitIdentityAvatar
                  name={identity?.name ?? null}
                  email={identity?.email ?? null}
                  label={identityLabel}
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
                  className="h-7 w-full min-w-0 gap-1 px-2 text-xs"
                  data-repo-git-control="commit"
                  onClick={() => void handleCommit()}
                  disabled={!canCommit}
                >
                  {isCommitting ? <Spinner className="size-3.5" /> : null}
                  <span className="truncate">
                    {isCommitting ? t("repo.committing") : commitButtonLabel}
                  </span>
                </Button>
              </span>
            </TooltipTrigger>
            {commitDisabledReason ? <TooltipContent>{commitDisabledReason}</TooltipContent> : null}
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
