import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileWarning } from "lucide-react";
import { toast } from "sonner";

import { MediaFilePreview } from "@/components/git/MediaFilePreview";
import { TextDiffPreview } from "@/components/git/TextDiffPreview";
import { Spinner } from "@/components/ui/spinner";

import { gitService } from "@/services/git";
import { openFileHistoryWindow } from "@/services/window/historyWindows";
import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";
import type { GitDiffResult } from "@/types/git";
import { isImagePath } from "@/utils/mediaPath";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

interface WorkspaceFilePreviewProps {
  repoPath: string;
  filePath: string;
}

function buildFileDiff(text: string, binary: boolean, truncated: boolean): GitDiffResult {
  return {
    oldText: "",
    newText: text,
    patch: "",
    binary,
    truncated,
  };
}

/** 工作区文件预览：复用对比工具（Monaco 文件视图 + 追溯 / 历史） */
export function WorkspaceFilePreview({
  repoPath,
  filePath,
}: WorkspaceFilePreviewProps) {
  const { t } = useTranslation();
  const [encoding, setEncoding] = useState(DEFAULT_TEXT_ENCODING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const image = isImagePath(filePath);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDiff(null);

    if (image) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    void gitService
      .readWorktreeFile(repoPath, filePath, { encoding })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setDiff(buildFileDiff(result.text, result.binary, result.truncated));
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
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
  }, [encoding, filePath, image, repoPath]);

  const selectionKey = useMemo(
    () => `${repoPath}\0${filePath}\0${encoding}`,
    [encoding, filePath, repoPath],
  );

  function handleOpenHistory(): void {
    const project = useProjectStore
      .getState()
      .projects.find((item) => item.path === repoPath);
    if (!project) {
      toast.error(t("repo.diffOpenFileHistoryFailed"));
      return;
    }
    void openFileHistoryWindow({
      projectId: project.id,
      filePath,
    }).catch((openError: unknown) => {
      toast.error(toUserMessage(openError) || t("repo.diffOpenFileHistoryFailed"));
    });
  }

  if (loading) {
    return (
      <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center gap-2 text-sm">
        <Spinner className="size-4" />
        {t("common.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm">
        <FileWarning className="size-8 opacity-60" aria-hidden="true" />
        {error}
      </div>
    );
  }

  if (image) {
    return (
      <MediaFilePreview
        repoPath={repoPath}
        filePath={filePath}
        oldSource={null}
        newSource="worktree"
        newLabel={t("repo.viewWorkspace")}
      />
    );
  }

  if (!diff) {
    return (
      <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center text-sm">
        {t("repo.workspacePreviewEmpty")}
      </div>
    );
  }

  return (
    <TextDiffPreview
      path={filePath}
      diff={diff}
      selectionKey={selectionKey}
      encoding={encoding}
      onEncodingChange={setEncoding}
      repoPath={repoPath}
      defaultMode="file"
      workspaceFileChrome
      oldLabel={<span className="truncate">HEAD</span>}
      newLabel={<span className="truncate">{t("repo.viewWorkspace")}</span>}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onOpenHistory={handleOpenHistory}
    />
  );
}
