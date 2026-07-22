import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/ui/spinner";

import { cn } from "@/lib/utils";

interface AgentReasoningBlockProps {
  reasoning: string;
  isStreaming: boolean;
  /** 是否已开始输出最终正文 */
  hasAnswer: boolean;
  /** 深度思考用时（毫秒） */
  durationMs?: number;
}

/**
 * DeepSeek 风格深度思考区：推理中默认展开，开始出正文后默认收起，可手动切换。
 */
export function AgentReasoningBlock({
  reasoning,
  isStreaming,
  hasAnswer,
  durationMs,
}: AgentReasoningBlockProps) {
  const { t } = useTranslation();
  const thinking = isStreaming && !hasAnswer;
  const [open, setOpen] = useState(thinking);
  const autoCollapsedRef = useRef(false);
  const durationSeconds =
    durationMs != null && durationMs >= 0
      ? Math.max(1, Math.round(durationMs / 1000))
      : null;

  useEffect(() => {
    if (thinking) {
      setOpen(true);
      autoCollapsedRef.current = false;
      return;
    }
    // 正文开始时只自动收起一次，避免覆盖用户手动展开
    if (hasAnswer && !autoCollapsedRef.current) {
      setOpen(false);
      autoCollapsedRef.current = true;
    }
  }, [thinking, hasAnswer]);

  if (!reasoning.trim()) {
    return null;
  }

  return (
    <div className={cn(hasAnswer && "mb-1.5")}>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-1 text-left text-[11px] leading-none font-medium"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
        {thinking ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner className="size-3" />
            {t("agent.deepThinking")}
          </span>
        ) : (
          <span>
            {durationSeconds != null
              ? t("agent.deepThoughtDoneWithDuration", {
                  seconds: durationSeconds,
                })
              : t("agent.deepThoughtDone")}
          </span>
        )}
      </button>
      {open ? (
        <div className="text-muted-foreground border-border/70 mt-1.5 border-l-2 pl-2.5 text-[11px] leading-relaxed whitespace-pre-wrap">
          {reasoning}
          {thinking ? (
            <span
              className="bg-muted-foreground ml-0.5 inline-block h-2.5 w-0.5 animate-pulse align-middle"
              aria-hidden="true"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
