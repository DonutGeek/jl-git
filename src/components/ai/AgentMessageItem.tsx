import dayjs from "dayjs";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentMessageCopyButton } from "@/components/ai/AgentMessageCopyButton";
import {
  AgentRichMessage,
  parseAgentMessage,
  type CompareBranchesAction,
} from "@/components/ai/AgentRichMessage";
import { cn } from "@/lib/utils";
import type { AgentChatMessage } from "@/types/ai";

interface AgentMessageItemProps {
  message: AgentChatMessage;
  onCompareBranches: (action: CompareBranchesAction) => void;
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

/** 单条消息气泡：内容 / 流式态 / 时间 / 复制 */
export function AgentMessageItem({ message, onCompareBranches }: AgentMessageItemProps) {
  const { t } = useTranslation();
  const isUser = message.role === "user";

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "w-fit max-w-[88%] wrap-break-word rounded-lg px-3 py-2 text-xs leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground whitespace-pre-wrap"
            : "bg-muted text-foreground whitespace-normal",
        )}
      >
        {message.content ? (
          <AgentRichMessage
            {...parseAgentMessage(message.content)}
            onCompareBranches={onCompareBranches}
          />
        ) : null}
        {message.isStreaming ? (
          message.content ? (
            // 流式出字：末尾光标，避免转圈抢注意力
            <span
              className="bg-foreground ml-0.5 inline-block h-3 w-0.5 animate-pulse align-middle"
              aria-hidden="true"
            />
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
              <span>{t("agent.thinking")}</span>
            </span>
          )
        ) : null}
      </div>
      {!message.isStreaming && message.content.trim() ? (
        <div className="flex items-center gap-1.5 px-0.5">
          <time
            className="text-muted-foreground text-xs leading-none tabular-nums"
            dateTime={message.createdAt}
          >
            {formatMessageTime(message.createdAt)}
          </time>
          <AgentMessageCopyButton content={message.content} />
        </div>
      ) : null}
    </div>
  );
}
