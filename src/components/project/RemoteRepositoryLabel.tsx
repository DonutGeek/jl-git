import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitFork } from "lucide-react";
import { toast } from "sonner";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toUserMessage } from "@/types/error";
import { copyToClipboard } from "@/utils/clipboard";
import { toBrowsableRemoteUrl, type RemoteRepository } from "@/utils/remoteRepository";

interface RemoteRepositoryLabelProps {
  remote: RemoteRepository;
  onOpen: (url: string) => void;
  /** 覆盖默认样式（最近列表默认右对齐；详情等场景可左对齐） */
  className?: string;
}

/** 远程仓库标签：单击复制 URL，双击打开托管页。 */
export function RemoteRepositoryLabel({ remote, onOpen, className }: RemoteRepositoryLabelProps) {
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

  async function copyRemoteUrl(): Promise<void> {
    try {
      await copyToClipboard(remote.url);
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
    // 外层负责对齐与最大宽度；触发器 w-max，Tooltip 锚定可见内容中心
    <div className={cn("ml-auto inline-flex max-w-[46%] min-w-0 shrink-0", className)}>
      <Tooltip open={copied ? true : undefined} delayDuration={200}>
        <TooltipTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            className="text-primary focus-visible:ring-ring inline-flex w-max max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-sm font-mono text-xs hover:underline focus-visible:ring-2 focus-visible:outline-none"
            title={remote.url}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void copyRemoteUrl();
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const browseUrl = toBrowsableRemoteUrl(remote.url);
              if (!browseUrl) {
                toast.error(t("repo.openRemoteUnsupported"));
                return;
              }
              onOpen(browseUrl);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                void copyRemoteUrl();
              }
            }}
          >
            <GitFork className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{remote.repositoryName}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {copied ? t("repo.copySuccess") : t("repo.copy")}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
