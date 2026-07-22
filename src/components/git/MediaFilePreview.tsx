import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { gitService } from "@/services/git";
import { toUserMessage } from "@/types/error";
import type { GitFileMedia, GitFileMediaSource } from "@/types/git";
import { gitStatusBorderClass } from "@/utils/gitStatusStyle";

interface MediaFilePreviewProps {
  repoPath: string;
  filePath: string;
  /** null 表示该侧不存在（新增/删除/空树） */
  oldSource: GitFileMediaSource | null;
  newSource: GitFileMediaSource | null;
  oldLabel?: string;
  newLabel?: string;
  /** 原始 porcelain 状态字（? / U / A / M…），用于图片描边 */
  statusCode?: string | null;
  /** 冲突条目（含 AA/DD）强制冲突色 */
  conflict?: boolean;
}

function mediaToDataUrl(media: GitFileMedia | null): string | null {
  if (!media?.present || media.kind !== "image" || !media.mime || !media.base64) {
    return null;
  }
  return `data:${media.mime};base64,${media.base64}`;
}

/** 棋盘格：底色 + muted 格，透明格露出底色，整窗铺满 */
const checkerboardClass =
  "bg-background bg-[length:16px_16px] bg-[linear-gradient(45deg,var(--muted)_25%,transparent_25%),linear-gradient(-45deg,var(--muted)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--muted)_75%),linear-gradient(-45deg,transparent_75%,var(--muted)_75%)] bg-[position:0_0,0_8px,8px_-8px,-8px_0]";

interface ImagePaneProps {
  src: string | null;
  alt: string;
  showCheckerboard: boolean;
  emptyText: string;
  /** 状态描边 class，如 border-git-added */
  borderClassName?: string;
}

function ImagePane({
  src,
  alt,
  showCheckerboard,
  emptyText,
  borderClassName,
}: ImagePaneProps) {
  return (
    // 背景打在外层铺满整栏；ScrollArea 只负责滚动，避免内容不够高时底部露黑
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        showCheckerboard ? checkerboardClass : "bg-background",
      )}
    >
      <ScrollArea
        className={cn(
          "min-h-0 w-full flex-1 bg-transparent",
          "[&_[data-slot=scroll-area-viewport]]:bg-transparent",
          "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-h-full [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full",
          "[&_[data-slot=scroll-area-scrollbar][data-state=hidden]]:hidden",
        )}
      >
        <div className="flex min-h-full items-center justify-center bg-transparent p-4">
          {src ? (
            <img
              src={src}
              alt={alt}
              className={cn(
                "max-h-[min(70vh,36rem)] max-w-full rounded-md border bg-transparent object-contain",
                borderClassName ?? "border-border",
              )}
            />
          ) : (
            <p className="text-muted-foreground text-sm">{emptyText}</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * 图片等媒体文件预览：两侧都有则左右对比，否则单侧展示；支持棋盘背景。
 */
export function MediaFilePreview({
  repoPath,
  filePath,
  oldSource,
  newSource,
  oldLabel,
  newLabel,
  statusCode,
  conflict = false,
}: MediaFilePreviewProps) {
  const { t } = useTranslation();
  const [showBackground, setShowBackground] = useState(true);
  const statusBorderClass = statusCode
    ? gitStatusBorderClass(statusCode, { conflict })
    : undefined;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oldMedia, setOldMedia] = useState<GitFileMedia | null>(null);
  const [newMedia, setNewMedia] = useState<GitFileMedia | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load(): Promise<void> {
      const [oldResult, newResult] = await Promise.all([
        oldSource
          ? gitService.getFileMedia(repoPath, { filePath, source: oldSource })
          : Promise.resolve(null),
        newSource
          ? gitService.getFileMedia(repoPath, { filePath, source: newSource })
          : Promise.resolve(null),
      ]);
      if (cancelled) {
        return;
      }
      setOldMedia(oldResult);
      setNewMedia(newResult);
    }

    void load()
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setOldMedia(null);
          setNewMedia(null);
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
  }, [repoPath, filePath, oldSource, newSource]);

  const oldUrl = useMemo(() => mediaToDataUrl(oldMedia), [oldMedia]);
  const newUrl = useMemo(() => mediaToDataUrl(newMedia), [newMedia]);

  const resolvedOldLabel = oldLabel ?? t("repo.diffBaseUnstaged");
  const resolvedNewLabel = newLabel ?? t("repo.diffLocalUnstaged");

  if (loading) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
        <Spinner className="size-4" />
        {t("common.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive flex flex-1 items-center justify-center px-4 text-center text-sm">
        {error}
      </div>
    );
  }

  const oldIsImage = Boolean(oldUrl);
  const newIsImage = Boolean(newUrl);
  if (!oldIsImage && !newIsImage) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center px-4 text-center text-sm">
        {t("repo.diffBinary")}
      </div>
    );
  }

  const showSplit = oldIsImage && newIsImage;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-border flex h-8 shrink-0 items-center justify-end gap-3 border-b px-3">
        {oldMedia?.truncated || newMedia?.truncated ? (
          <span className="text-muted-foreground mr-auto text-[11px]">
            {t("repo.mediaTruncated")}
          </span>
        ) : null}
        <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-[11px]">
          <input
            type="checkbox"
            className="accent-primary size-3.5"
            checked={showBackground}
            onChange={(event) => setShowBackground(event.target.checked)}
          />
          {t("repo.mediaShowBackground")}
        </label>
      </div>

      {showSplit ? (
        <div className="flex min-h-0 flex-1">
          {/* 分栏外包必须是 flex 列，否则子级 flex-1/h-full 撑不满，棋盘格只跟图片高度 */}
          <div className="border-border flex min-h-0 min-w-0 flex-1 flex-col border-r">
            <ImagePane
              src={oldUrl}
              alt={resolvedOldLabel}
              showCheckerboard={showBackground}
              emptyText={t("repo.mediaEmpty")}
              borderClassName={statusBorderClass}
            />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ImagePane
              src={newUrl}
              alt={resolvedNewLabel}
              showCheckerboard={showBackground}
              emptyText={t("repo.mediaEmpty")}
              borderClassName={statusBorderClass}
            />
          </div>
        </div>
      ) : (
        <ImagePane
          src={newUrl ?? oldUrl}
          alt={newUrl ? resolvedNewLabel : resolvedOldLabel}
          showCheckerboard={showBackground}
          emptyText={t("repo.mediaEmpty")}
          borderClassName={statusBorderClass}
        />
      )}
    </div>
  );
}
