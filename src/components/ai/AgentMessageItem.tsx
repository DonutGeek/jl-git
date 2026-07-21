import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { LoaderCircle, Pencil, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentMessageCopyButton } from "@/components/ai/AgentMessageCopyButton";
import { AgentReasoningBlock } from "@/components/ai/AgentReasoningBlock";
import {
  AgentRichMessage,
  parseAgentMessage,
  type CompareBranchesAction,
} from "@/components/ai/AgentRichMessage";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AgentChatMessage } from "@/types/ai";

interface AgentMessageItemProps {
  message: AgentChatMessage;
  onCompareBranches: (action: CompareBranchesAction) => void;
  /** 当前对话最后一条已完成助手回复可重生成 */
  canRegenerate?: boolean;
  /** 用户消息可内联修改后截断重发 */
  canEdit?: boolean;
  actionsDisabled?: boolean;
  onRegenerate?: () => void;
  onEditSubmit?: (content: string) => void;
}

/** 当天只显示时分秒，跨天带上日期 */
function formatMessageTime(iso: string): string {
  const time = dayjs(iso);
  if (!time.isValid()) {
    return "";
  }
  if (time.isSame(dayjs(), "day")) {
    return time.format("HH:mm:ss");
  }
  return time.format("YYYY-MM-DD HH:mm:ss");
}

/** 单条消息气泡：内容 / 流式态 / 时间 / 复制 / 重生成 / 编辑 */
export function AgentMessageItem({
  message,
  onCompareBranches,
  canRegenerate = false,
  canEdit = false,
  actionsDisabled = false,
  onRegenerate,
  onEditSubmit,
}: AgentMessageItemProps) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);

  useEffect(() => {
    if (!isEditing) {
      setEditDraft(message.content);
    }
  }, [message.content, isEditing]);

  function cancelEdit(): void {
    setEditDraft(message.content);
    setIsEditing(false);
  }

  function submitEdit(): void {
    const next = editDraft.trim();
    if (!next || actionsDisabled) {
      return;
    }
    // 先提交再关编辑，避免虚拟列表在截断前先闪回旧气泡
    onEditSubmit?.(next);
    setIsEditing(false);
  }

  const showFooter =
    !message.isStreaming &&
    !isEditing &&
    (Boolean(message.content.trim()) || Boolean(message.reasoningContent?.trim()));

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      {isEditing ? (
        <div
          className={cn(
            "border-ring bg-muted text-foreground w-full max-w-[88%] rounded-lg border px-3 pt-2 pb-2 shadow-none",
          )}
        >
          <textarea
            value={editDraft}
            onChange={(event) => setEditDraft(event.target.value)}
            rows={Math.min(8, Math.max(2, editDraft.split("\n").length))}
            className="placeholder:text-muted-foreground field-sizing-content max-h-48 w-full resize-none border-0 bg-transparent text-xs leading-relaxed outline-none"
            aria-label={t("agent.editMessage")}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit();
              }
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submitEdit();
              }
            }}
          />
          <div className="mt-2 flex justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-7 px-2.5 text-xs"
              onClick={cancelEdit}
            >
              {t("agent.editCancel")}
            </Button>
            <Button
              type="button"
              size="xs"
              className="h-7 px-2.5 text-xs"
              disabled={!editDraft.trim() || actionsDisabled}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                submitEdit();
              }}
            >
              {t("agent.editSend")}
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "w-fit max-w-[88%] wrap-break-word rounded-lg px-3 py-2 text-xs leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground whitespace-pre-wrap"
              : "bg-muted text-foreground whitespace-normal",
          )}
        >
          {!isUser && message.reasoningContent ? (
            <AgentReasoningBlock
              reasoning={message.reasoningContent}
              isStreaming={Boolean(message.isStreaming)}
              hasAnswer={Boolean(message.content.trim())}
              durationMs={message.reasoningDurationMs}
            />
          ) : null}
          {message.content ? (
            isUser ? (
              message.content
            ) : (
              <AgentRichMessage
                {...parseAgentMessage(message.content)}
                onCompareBranches={onCompareBranches}
                trailingCursor={Boolean(message.isStreaming)}
              />
            )
          ) : null}
          {message.isStreaming && !message.content && !message.reasoningContent ? (
            <span className="inline-flex items-center gap-1.5">
              <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
              <span>{t("agent.thinking")}</span>
            </span>
          ) : null}
        </div>
      )}
      {showFooter ? (
        <div
          className={cn(
            "flex items-center gap-1.5 px-0.5",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          <time
            className="text-muted-foreground text-xs leading-none tabular-nums"
            dateTime={message.createdAt}
          >
            {formatMessageTime(message.createdAt)}
          </time>
          {canEdit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground inline-flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
                  aria-label={t("agent.editMessage")}
                  disabled={actionsDisabled}
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="size-3" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("agent.editMessage")}</TooltipContent>
            </Tooltip>
          ) : null}
          {message.content.trim() ? (
            <AgentMessageCopyButton content={message.content} />
          ) : null}
          {canRegenerate ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground inline-flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
                  aria-label={t("agent.regenerate")}
                  disabled={actionsDisabled}
                  onClick={() => onRegenerate?.()}
                >
                  <RefreshCw className="size-3" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("agent.regenerate")}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
