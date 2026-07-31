import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CopyablePathLabel } from "@/components/git/CopyablePathLabel";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { MediaFilePreview } from "@/components/git/MediaFilePreview";
import { TextDiffPreview } from "@/components/git/TextDiffPreview";
import { cn } from "@/lib/utils";

import { gitService } from "@/services/git";
import { openFileHistoryWindow } from "@/services/window/historyWindows";
import { useProjectStore } from "@/store/useProjectStore";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";
import type { GitDiffResult } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import { gitStatusLetterClass, normalizeGitStatusLetter } from "@/utils/gitStatusStyle";
import { isImagePath } from "@/utils/mediaPath";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

/** 差异顶栏可复制完整 rev：悬停提示复制，点击写入剪贴板 */
function CopyableDiffRev({ hash }: { hash: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copyHash(): Promise<void> {
    try {
      await copyToClipboard(hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      toast.error(toUserMessage(error) || t("repo.copyFailed"));
    }
  }

  return (
    <Tooltip open={copied ? true : undefined} delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-primary min-w-0 cursor-pointer truncate border-0 border-b border-transparent bg-transparent p-0 pb-px font-mono text-[11px] leading-none hover:border-current"
          aria-label={t("repo.copy")}
          title={hash}
          onClick={() => {
            void copyHash();
          }}
        >
          {hash}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        {copied ? t("repo.copySuccess") : t("repo.copy")}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * 历史详情左侧：点击改动文件后整区切到该文件相对 parent 的前后对比。
 * Diff 主体复用 TextDiffPreview。
 */
export function CommitFileDiffPane() {
  const { t } = useTranslation();
  const repoPath = useRepoStore((state) => state.repoPath);
  const selectedCommitFile = useRepoStore((state) => state.selectedCommitFile);
  const selectCommitFile = useRepoStore((state) => state.selectCommitFile);

  const [encoding, setEncoding] = useState(DEFAULT_TEXT_ENCODING);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commitFileKey = selectedCommitFile
    ? `${selectedCommitFile.commitId}:${selectedCommitFile.parentId}:${selectedCommitFile.path}`
    : "";

  useEffect(() => {
    if (!repoPath || !selectedCommitFile) {
      setDiff(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void gitService
      .getCommitFileDiff(repoPath, {
        filePath: selectedCommitFile.path,
        commitRev: selectedCommitFile.commitId,
        parentRev: selectedCommitFile.parentId,
        encoding,
      })
      .then((result) => {
        if (!cancelled) {
          setDiff(result);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setDiff(null);
          setError(toUserMessage(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repoPath, selectedCommitFile, encoding]);

  if (!selectedCommitFile) {
    return null;
  }

  const statusLetter = normalizeGitStatusLetter(selectedCommitFile.status);
  const filePath = selectedCommitFile.path;
  const parentFullId = selectedCommitFile.parentId === "" ? null : selectedCommitFile.parentId;
  const commitFullId = selectedCommitFile.commitId;
  const isRootCommit = selectedCommitFile.parentId === "";
  const isImageBinary = Boolean(diff?.binary && isImagePath(selectedCommitFile.path));

  const oldLabel =
    isRootCommit || !parentFullId ? (
      <span className="text-foreground truncate font-mono">{t("repo.diffEmptyTree")}</span>
    ) : (
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="text-muted-foreground shrink-0">{t("repo.diffParentLabel")}</span>
        <CopyableDiffRev hash={parentFullId} />
      </div>
    );

  const newLabel = (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="text-muted-foreground shrink-0">{t("repo.diffCommitLabel")}</span>
      <CopyableDiffRev hash={commitFullId} />
    </div>
  );

  return (
    <div className="bg-background flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <div className="border-border flex h-11 shrink-0 items-center gap-1.5 border-b px-2">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 shrink-0 [&_svg]:size-3.5"
              aria-label={t("repo.commitDiffBack")}
              onClick={() => selectCommitFile(null)}
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("repo.commitDiffBack")}</TooltipContent>
        </Tooltip>
        {statusLetter ? (
          <span
            className={cn(
              "w-3.5 shrink-0 text-center font-mono text-[11px] leading-none font-semibold",
              gitStatusLetterClass(selectedCommitFile.status),
            )}
            aria-label={statusLetter}
          >
            {statusLetter}
          </span>
        ) : null}
        <MaterialFileIcon name={filePath} isDir={false} className="size-3.5 shrink-0" />
        <CopyablePathLabel path={filePath} />
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 shrink-0 [&_svg]:size-3.5"
              aria-label={t("repo.diffClosePreview")}
              onClick={() => selectCommitFile(null)}
            >
              <X aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("repo.diffClosePreview")}</TooltipContent>
        </Tooltip>
      </div>

      {loading ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
          <Spinner className="size-4" />
          {t("common.loading")}
        </div>
      ) : null}

      {!loading && error ? (
        <div className="text-destructive flex flex-1 items-center justify-center px-4 text-center text-sm">
          {error}
        </div>
      ) : null}

      {!loading && !error && isImageBinary && repoPath ? (
        <MediaFilePreview
          repoPath={repoPath}
          filePath={selectedCommitFile.path}
          oldSource={selectedCommitFile.parentId === "" ? null : selectedCommitFile.parentId}
          newSource={selectedCommitFile.commitId}
          oldLabel={
            selectedCommitFile.parentId === "" ? t("repo.diffEmptyTree") : t("repo.diffParentLabel")
          }
          newLabel={t("repo.diffCommitLabel")}
          statusCode={selectedCommitFile.status}
        />
      ) : null}

      {!loading && !error && diff && !isImageBinary ? (
        <TextDiffPreview
          path={selectedCommitFile.path}
          diff={diff}
          selectionKey={commitFileKey}
          encoding={encoding}
          onEncodingChange={setEncoding}
          repoPath={repoPath}
          blameRev={selectedCommitFile.commitId}
          oldLabel={oldLabel}
          newLabel={newLabel}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onOpenHistory={() => {
            if (!repoPath) return;
            const filePath = selectedCommitFile.path;
            void (async () => {
              try {
                const store = useProjectStore.getState();
                let project = store.projects.find((item) => item.path === repoPath);
                if (!project) {
                  // 分支历史等子窗可能尚未灌入 project store
                  const projects = await store.loadProjects();
                  project = projects.find((item) => item.path === repoPath);
                }
                if (!project) {
                  toast.error(t("repo.diffOpenFileHistoryFailed"));
                  return;
                }
                await openFileHistoryWindow({
                  projectId: project.id,
                  filePath,
                  ref: useRepoStore.getState().logRef,
                });
              } catch (error: unknown) {
                toast.error(toUserMessage(error) || t("repo.diffOpenFileHistoryFailed"));
              }
            })();
          }}
        />
      ) : null}
    </div>
  );
}
