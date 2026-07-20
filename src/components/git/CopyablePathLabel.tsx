import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { TruncateStartPath } from "@/components/common/TruncateStartPath";
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
 * 可点击复制的文件路径；过长时前部省略（…/尾部路径）。
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
            aria-label={t("repo.copy")}
            className={cn(
              "text-foreground flex min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left underline-offset-2 hover:underline",
              className,
            )}
            onClick={() => {
              void copyPath();
            }}
          >
            <TruncateStartPath path={path} className="font-mono" />
          </button>
        </TooltipTrigger>
        {/* 勿 align=start：宽触发器下 Floating UI 会隐藏无法居中的箭头 */}
        <TooltipContent side="top">
          {copied ? t("repo.copySuccess") : t("repo.copy")}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
