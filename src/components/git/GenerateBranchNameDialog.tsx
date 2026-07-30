import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useAppPrefsStore } from "@/store/useAppPrefsStore";
import { useLocaleStore } from "@/store/useLocaleStore";

import { generateBranchName, toastAiFailure } from "@/services/ai";
import type { BranchAttachment } from "@/utils/branchAttachment";
import {
  BranchAttachmentError,
  MAX_ATTACHMENT_TEXT_TOTAL,
  MAX_BRANCH_ATTACHMENTS,
  parseBranchAttachmentFile,
} from "@/utils/branchAttachment";

interface GenerateBranchNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 生成成功后回填完整分支名 */
  onGenerated: (branchName: string) => void;
}

const FILE_ACCEPT = ".md,.markdown,.txt,.docx,.pdf";

/** 根据详情与附件调用 AI 生成分支名（二级弹窗） */
export function GenerateBranchNameDialog({
  open,
  onOpenChange,
  onGenerated,
}: GenerateBranchNameDialogProps) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const branchPrefix = useAppPrefsStore((state) => state.branchPrefix);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [detail, setDetail] = useState("");
  const [attachments, setAttachments] = useState<BranchAttachment[]>([]);
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDetail("");
    setAttachments([]);
    setParsing(false);
    setGenerating(false);
    setDragOver(false);
    dragDepthRef.current = 0;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [open]);

  const busy = generating || parsing;
  const canSubmit = (detail.trim().length > 0 || attachments.length > 0) && !busy;
  const canAddMore = attachments.length < MAX_BRANCH_ATTACHMENTS && !busy;

  function handleOpenChange(next: boolean): void {
    if (!next && busy) {
      return;
    }
    onOpenChange(next);
  }

  async function ingestFiles(fileList: File[]): Promise<void> {
    if (fileList.length === 0) {
      return;
    }

    const room = MAX_BRANCH_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast.error(t("repo.aiBranchAttachmentLimit", { count: MAX_BRANCH_ATTACHMENTS }));
      return;
    }

    const accepted = fileList.slice(0, room);
    if (fileList.length > room) {
      toast.message(
        t("repo.aiBranchAttachmentLimitTrim", {
          count: MAX_BRANCH_ATTACHMENTS,
        }),
      );
    }

    setParsing(true);
    // 先让「解析中」完成绘制，再做重活，避免整窗看似无反馈卡死
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
    try {
      let budget =
        MAX_ATTACHMENT_TEXT_TOTAL - attachments.reduce((sum, item) => sum + item.text.length, 0);
      const next: BranchAttachment[] = [];
      for (const file of accepted) {
        try {
          const parsed = await parseBranchAttachmentFile(file, budget);
          next.push(parsed);
          budget = Math.max(0, budget - parsed.text.length);
        } catch (error) {
          const message =
            error instanceof BranchAttachmentError || error instanceof Error
              ? error.message
              : t("repo.aiBranchAttachmentParseFailed", { name: file.name });
          toast.error(message);
        }
      }
      if (next.length > 0) {
        setAttachments((prev) => [...prev, ...next]);
      }
    } finally {
      setParsing(false);
    }
  }

  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await ingestFiles(files);
  }

  // 依赖 tauri 窗口 dragDropEnabled:false，否则原生拦截导致 HTML5 drop 收不到 File
  function handleDragEnter(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    if (!canAddMore) {
      return;
    }
    dragDepthRef.current += 1;
    setDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragOver(false);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    if (canAddMore) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragOver(false);
    if (!canAddMore) {
      toast.error(t("repo.aiBranchAttachmentLimit", { count: MAX_BRANCH_ATTACHMENTS }));
      return;
    }
    const files = Array.from(event.dataTransfer.files ?? []);
    await ingestFiles(files);
  }

  function removeAttachment(id: string): void {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setGenerating(true);
    try {
      const name = await generateBranchName({
        detail,
        prefix: branchPrefix,
        locale,
        attachments: attachments.map((item) => ({
          name: item.name,
          text: item.text,
          truncated: item.truncated,
        })),
      });
      onGenerated(name);
      onOpenChange(false);
    } catch (error) {
      toastAiFailure(error, t("ai.errors.requestFailed"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <AppDialogContent className="flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("repo.aiGenerateBranchTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="ai-branch-detail">{t("repo.aiBranchDetail")}</FieldLabel>
              <Textarea
                id="ai-branch-detail"
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
                placeholder={t("repo.aiBranchDetailPlaceholder")}
                disabled={busy}
                autoFocus
                className="min-h-28 resize-none"
              />
            </Field>

            <Field>
              <FieldLabel>{t("repo.aiBranchAttachments")}</FieldLabel>
              <p className="text-muted-foreground text-xs">
                {t("repo.aiBranchAttachmentsHint", {
                  count: MAX_BRANCH_ATTACHMENTS,
                })}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                multiple
                className="hidden"
                disabled={!canAddMore}
                onChange={(event) => void handleFilesSelected(event)}
              />
              <div className="flex flex-col gap-2">
                <div
                  role="button"
                  tabIndex={canAddMore ? 0 : -1}
                  aria-disabled={!canAddMore}
                  aria-label={t("repo.aiBranchAttachmentDropAria")}
                  className={cn(
                    "border-border bg-muted/20 flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 text-center transition-colors",
                    canAddMore
                      ? "hover:border-primary/50 hover:bg-muted/40 cursor-pointer"
                      : "cursor-not-allowed opacity-60",
                    dragOver && canAddMore ? "border-primary bg-primary/5" : null,
                  )}
                  onClick={() => {
                    if (canAddMore) {
                      fileInputRef.current?.click();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (!canAddMore) {
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={(event) => void handleDrop(event)}
                >
                  {parsing ? (
                    <Spinner className="size-4" />
                  ) : (
                    <FileUp className="text-muted-foreground size-4" aria-hidden="true" />
                  )}
                  <div className="text-muted-foreground text-xs leading-relaxed">
                    <p>
                      {parsing
                        ? t("repo.aiBranchAttachmentParsing")
                        : t("repo.aiBranchAttachmentDropHint")}
                    </p>
                    {!parsing ? (
                      <p className="text-foreground/80 mt-1">
                        {t("repo.aiBranchAttachmentBrowse")}
                      </p>
                    ) : null}
                  </div>
                </div>

                {attachments.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {attachments.map((item) => (
                      <li
                        key={item.id}
                        className="border-border bg-muted/30 flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {item.name}
                          {item.truncated ? ` ${t("repo.aiBranchAttachmentTruncated")}` : ""}
                        </span>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-6 shrink-0"
                              disabled={busy}
                              aria-label={t("repo.aiBranchAttachmentRemove", {
                                name: item.name,
                              })}
                              onClick={() => removeAttachment(item.id)}
                            >
                              <X className="size-3.5" aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("repo.aiBranchAttachmentRemove", {
                              name: item.name,
                            })}
                          </TooltipContent>
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => handleOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {generating ? <Spinner className="size-3.5" /> : null}
              {generating ? t("repo.aiGenerating") : t("repo.aiGenerateBranchAction")}
            </Button>
          </DialogFooter>
        </form>
      </AppDialogContent>
    </Dialog>
  );
}
