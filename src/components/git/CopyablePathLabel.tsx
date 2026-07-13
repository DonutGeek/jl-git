import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toUserMessage } from "@/types/error";
import { copyToClipboard } from "@/utils/clipboard";

interface CopyablePathLabelProps {
  path: string;
  className?: string;
}

/**
 * 可点击复制的文件路径。
 * 触发器宽度跟文字走（超长才裁切），提示相对路径文字居中；
 * 默认向上，上方不够由 Radix 翻到下方 —— 与「往上提示」不冲突。
 */
export function CopyablePathLabel({ path, className }: CopyablePathLabelProps) {
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

  async function copyPath(): Promise<void> {
    try {
      await copyToClipboard(path);
      setCopied(true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      toast.error(toUserMessage(error) || t("repo.copyFailed"));
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-center overflow-hidden">
      <Tooltip open={copied ? true : undefined} delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            title={path}
            aria-label={t("repo.copy")}
            className={cn(
              "text-foreground inline-block max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left align-middle font-mono text-xs underline-offset-2 hover:underline",
              className,
            )}
            // 跟文字同宽，避免锚到整行 flex 中心
            style={{ width: "fit-content", maxWidth: "100%" }}
            onClick={() => {
              void copyPath();
            }}
          >
            {path}
          </button>
        </TooltipTrigger>
        <TooltipContent align="center" sideOffset={6}>
          {copied ? t("repo.copySuccess") : t("repo.copy")}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
