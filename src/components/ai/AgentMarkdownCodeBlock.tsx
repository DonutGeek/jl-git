import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toUserMessage } from "@/types/error";
import { highlightAgentCode } from "@/utils/agentHighlight";
import { copyToClipboard } from "@/utils/clipboard";

interface AgentMarkdownCodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

/** 鲸灵回复中的围栏代码块：语言标签 + 一键复制 + shadcn ScrollArea */
export function AgentMarkdownCodeBlock({ code, language, className }: AgentMarkdownCodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const label = language?.trim() || t("agent.codeBlock");
  const highlightedHtml = useMemo(() => highlightAgentCode(code, language), [code, language]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  async function handleCopy(): Promise<void> {
    try {
      await copyToClipboard(code);
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
    <div
      className={cn(
        "border-border bg-background/70 my-2 overflow-hidden rounded-md border",
        className,
      )}
    >
      <div className="border-border flex h-7 items-center justify-between gap-2 border-b px-2">
        <span className="text-muted-foreground truncate font-mono text-[10px] tracking-wide uppercase">
          {label}
        </span>
        <Tooltip open={copied ? true : undefined} delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 outline-none focus-visible:ring-1"
              aria-label={t("agent.copyCode")}
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
          <TooltipContent>{copied ? t("agent.copySuccess") : t("agent.copyCode")}</TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea className="max-h-72 [&_[data-slot=scroll-area-viewport]]:h-auto [&_[data-slot=scroll-area-viewport]]:max-h-72">
        <pre className="agent-markdown-code text-foreground m-0 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre">
          <code
            className="hljs inline-block min-w-max bg-transparent p-0 font-inherit text-inherit"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </pre>
      </ScrollArea>
    </div>
  );
}

/** 从 react-markdown children 抽出纯文本（用于复制） */
export function markdownChildrenToText(children: ReactNode): string {
  if (children == null || typeof children === "boolean") {
    return "";
  }
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return Children.toArray(children)
      .map((child) => markdownChildrenToText(child))
      .join("");
  }
  return "";
}
