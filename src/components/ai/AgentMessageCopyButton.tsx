import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toUserMessage } from "@/types/error";
import { copyToClipboard } from "@/utils/clipboard";

interface AgentMessageCopyButtonProps {
  content: string;
}

/** 消息底部复制按钮：写入剪贴板，短暂显示已复制态 */
export function AgentMessageCopyButton({ content }: AgentMessageCopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  async function handleCopy(): Promise<void> {
    try {
      await copyToClipboard(content);
      setCopied(true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      toast.error(toUserMessage(error) || t("agent.copyFailed"));
    }
  }

  return (
    <Tooltip open={copied ? true : undefined} delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={t("agent.copy")}
          onClick={() => {
            void handleCopy();
          }}
        >
          {copied ? (
            <Check className="size-3" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Copy className="size-3" strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {copied ? t("agent.copySuccess") : t("agent.copy")}
      </TooltipContent>
    </Tooltip>
  );
}
