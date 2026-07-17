import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyablePathLabel } from "@/components/git/CopyablePathLabel";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { MediaFilePreview } from "@/components/git/MediaFilePreview";
import { TextDiffPreview } from "@/components/git/TextDiffPreview";
import { cn } from "@/lib/utils";

import { gitService } from "@/services/git";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";
import type { GitDiffResult, GitStatusEntry } from "@/types/git";
import {
  gitStatusLetterClass,
  normalizeGitStatusLetter,
} from "@/utils/gitStatusStyle";
import { isImagePath } from "@/utils/mediaPath";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

/** 稳定空数组：避免 selector 每次返回新 [] */
const EMPTY_ENTRIES: GitStatusEntry[] = [];

/** 变更主区右侧：文件视图 / 差异视图（复用 TextDiffPreview） */
export function ChangesPreviewPane() {
  const { t } = useTranslation();
  const repoPath = useRepoStore((state) => state.repoPath);
  const selectedChange = useRepoStore((state) => state.selectedChange);
  const entries = useRepoStore((state) => state.status?.entries ?? EMPTY_ENTRIES);

  const [encoding, setEncoding] = useState(DEFAULT_TEXT_ENCODING);
  const [diffHidden, setDiffHidden] = useState(false);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectionKey = selectedChange
    ? `${selectedChange.side}:${selectedChange.path}`
    : "";

  // 切换文件时恢复显示差异
  useEffect(() => {
    setDiffHidden(false);
  }, [selectedChange?.path, selectedChange?.side]);

  useEffect(() => {
    if (!repoPath || !selectedChange) {
      setDiff(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void gitService
      .getDiff(repoPath, {
        filePath: selectedChange.path,
        staged: selectedChange.side === "index",
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
  }, [repoPath, selectedChange, encoding]);

  if (!selectedChange) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
        <FileText className="text-muted-foreground size-10 opacity-50" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("repo.diffPreviewTitle")}</p>
          <p className="text-muted-foreground max-w-sm text-xs">
            {t("repo.diffPreviewHint")}
          </p>
        </div>
      </div>
    );
  }

  const baseLabel =
    selectedChange.side === "index"
      ? t("repo.diffBaseStaged")
      : t("repo.diffBaseUnstaged");
  const localLabel =
    selectedChange.side === "index"
      ? t("repo.diffLocalStaged")
      : t("repo.diffLocalUnstaged");

  const statusEntry = entries.find((entry) => entry.path === selectedChange.path);
  const rawStatusCode = statusEntry
    ? selectedChange.side === "index"
      ? statusEntry.indexStatus
      : statusEntry.worktreeStatus
    : null;
  const statusLetter = rawStatusCode
    ? normalizeGitStatusLetter(rawStatusCode)
    : null;
  const statusConflict = statusEntry
    ? statusEntry.indexStatus === "U" ||
      statusEntry.worktreeStatus === "U" ||
      (statusEntry.indexStatus === "A" && statusEntry.worktreeStatus === "A") ||
      (statusEntry.indexStatus === "D" && statusEntry.worktreeStatus === "D")
    : false;

  const isImageBinary = Boolean(diff?.binary && isImagePath(selectedChange.path));

  return (
    <div className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-border flex h-8 shrink-0 items-center gap-1.5 border-b px-2">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 shrink-0 [&_svg]:size-3.5"
              aria-label={diffHidden ? t("repo.diffShow") : t("repo.diffHide")}
              aria-pressed={diffHidden}
              onClick={() => setDiffHidden((prev) => !prev)}
            >
              {diffHidden ? (
                <EyeOff aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent align="center">
            {diffHidden ? t("repo.diffShow") : t("repo.diffHide")}
          </TooltipContent>
        </Tooltip>
        {statusLetter && rawStatusCode ? (
          <span
            className={cn(
              "w-3.5 shrink-0 text-center font-mono text-[11px] leading-none font-semibold",
              gitStatusLetterClass(rawStatusCode, { conflict: statusConflict }),
            )}
            aria-label={statusLetter}
          >
            {statusLetter}
          </span>
        ) : null}
        <MaterialFileIcon
          name={selectedChange.path}
          isDir={false}
          className="size-3.5 shrink-0"
        />
        <CopyablePathLabel
          path={selectedChange.path}
          className="hover:text-foreground"
        />
      </div>

      {diffHidden ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <EyeOff
            className="text-muted-foreground size-12 opacity-40"
            aria-hidden="true"
          />
          <p className="text-muted-foreground text-sm">{t("repo.diffHide")}</p>
        </div>
      ) : (
        <>
          {loading ? (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
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
              filePath={selectedChange.path}
              oldSource="HEAD"
              newSource={selectedChange.side === "index" ? "index" : "worktree"}
              oldLabel={baseLabel}
              newLabel={localLabel}
              statusCode={rawStatusCode}
              conflict={statusConflict}
            />
          ) : null}

          {!loading && !error && diff && !isImageBinary ? (
            <TextDiffPreview
              path={selectedChange.path}
              diff={diff}
              selectionKey={selectionKey}
              encoding={encoding}
              onEncodingChange={setEncoding}
              oldLabel={<span className="truncate">{baseLabel}</span>}
              newLabel={<span className="truncate">{localLabel}</span>}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
