import { useState } from "react";
import { Copy, ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AppDialogContent } from "@/components/common/AppDialogContent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toUserMessage } from "@/types/error";
import { copyToClipboard } from "@/utils/clipboard";

interface AgentMarkdownImageProps {
  src: string | undefined;
  alt?: string;
}

/** 仅允许 http/https，与外链消毒策略一致 */
export function toSafeImageSrc(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** 鲸灵 Markdown 图片：气泡预览、Dialog 放大、复制链接 */
export function AgentMarkdownImage({ src, alt }: AgentMarkdownImageProps) {
  const { t } = useTranslation();
  const safeSrc = toSafeImageSrc(src);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!safeSrc) {
    return null;
  }

  const imageSrc = safeSrc;
  const caption = alt?.trim() || t("agent.imagePreview");

  async function handleCopyLink(): Promise<void> {
    try {
      await copyToClipboard(imageSrc);
      toast.success(t("agent.copySuccess"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("agent.copyFailed"));
    }
  }

  if (failed) {
    return (
      <span
        className="border-border bg-muted/40 text-muted-foreground my-2 flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-[11px]"
        role="img"
        aria-label={t("agent.imageLoadFailed")}
      >
        <ImageOff className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {t("agent.imageLoadFailed")}
      </span>
    );
  }

  return (
    <>
      <span className="group/md-img border-border bg-muted/20 my-2 inline-flex max-w-full flex-col overflow-hidden rounded-md border">
        <button
          type="button"
          className="focus-visible:ring-ring max-w-full cursor-zoom-in border-0 bg-transparent p-0 outline-none focus-visible:ring-2"
          aria-label={t("agent.imageOpen")}
          onClick={() => setOpen(true)}
        >
          <img
            src={imageSrc}
            alt={caption}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="max-h-48 max-w-full object-contain"
            onError={() => setFailed(true)}
          />
        </button>
        <span className="border-border flex h-7 items-center justify-between gap-2 border-t px-2">
          <span className="text-muted-foreground truncate text-[10px]">{caption}</span>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 outline-none focus-visible:ring-1"
                aria-label={t("agent.imageCopyLink")}
                onClick={() => {
                  void handleCopyLink();
                }}
              >
                <Copy className="size-3" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("agent.imageCopyLink")}</TooltipContent>
          </Tooltip>
        </span>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <AppDialogContent size="2xl" className="max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{caption}</DialogTitle>
            <DialogDescription className="truncate font-mono text-[11px]">
              {imageSrc}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/30 flex max-h-[min(70vh,36rem)] items-center justify-center overflow-hidden rounded-md">
            <img
              src={imageSrc}
              alt={caption}
              referrerPolicy="no-referrer"
              className="max-h-[min(70vh,36rem)] max-w-full object-contain"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1.5"
              onClick={() => {
                void handleCopyLink();
              }}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {t("agent.imageCopyLink")}
            </Button>
          </DialogFooter>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
