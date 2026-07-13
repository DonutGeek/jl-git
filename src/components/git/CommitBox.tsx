import { useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "dayjs/locale/en";
import { toast } from "sonner";

import { GitIdentityAvatar } from "@/components/git/GitIdentityAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { GitStatusEntry } from "@/types/git";

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
  const push = useRepoStore((state) => state.push);
  const status = useRepoStore((state) => state.status);
  const identity = useRepoStore((state) => state.identity);
  const commits = useRepoStore((state) => state.commits);

  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [busy, setBusy] = useState(false);

  const stagedCount = status?.entries.filter(isStagedEntry).length ?? 0;
  const working = loading || busy;
  // 待提交为空时不可提交（即使已填提交信息也不高亮）
  const canCommit = !working && commitMessage.trim().length > 0 && stagedCount > 0;
  const branchLabel = status?.branch ?? (status?.detached ? t("repo.detached") : "");
  const ahead = status?.ahead ?? 0;
  const hasUnpushed = ahead > 0;
  const tipCommit = hasUnpushed ? (commits[0] ?? null) : null;

  async function handleCommit(): Promise<void> {
    setBusy(true);
    try {
      await commit();
      toast.success(t("repo.commitSuccess"));

      if (pushAfterCommit) {
        const toastId = toast.loading(t("repo.pushStart"));
        try {
          const result = await push();
          const seconds = (result.elapsedMs / 1000).toFixed(3);
          toast.success(
            t("repo.pushSuccess", { remote: result.remote, seconds }),
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

  function handleUndo(): void {
    toast.message(t("repo.syncComingSoon", { action: t("repo.undoCommit") }));
  }

  const identityLabel =
    identity?.name || identity?.email
      ? t("repo.gitIdentity", {
          name: identity.name ?? identity.email ?? "",
        })
      : t("repo.gitIdentityDefault");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <label className="text-foreground flex shrink-0 cursor-pointer items-center gap-2 text-xs select-none">
        <input
          type="checkbox"
          className="border-input text-primary focus-visible:ring-ring size-3.5 shrink-0 rounded-sm border accent-primary"
          checked={pushAfterCommit}
          onChange={(event) => setPushAfterCommit(event.target.checked)}
          disabled={working}
        />
        <span>{t("repo.pushToRemote")}</span>
      </label>

      <Textarea
        value={commitMessage}
        onChange={(event) => setCommitMessage(event.target.value)}
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
                date: dayjs(tipCommit.authoredAt).format("YYYY年M月D日"),
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
            onClick={handleUndo}
          >
            {t("repo.undoCommit")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
