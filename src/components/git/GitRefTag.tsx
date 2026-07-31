import { useState, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tag } from "lucide-react";
import { toast } from "sonner";

import { TruncateStartPath } from "@/components/common/TruncateStartPath";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { toUserMessage } from "@/types/error";

import { copyToClipboard } from "@/utils/clipboard";

/** 远端展示用 origin&name，复制时还原为 origin/name 便于粘贴到 Git 命令 */
export function refClipboardText(ref: string): string {
  const amp = ref.indexOf("&");
  if (amp > 0) {
    return `${ref.slice(0, amp)}/${ref.slice(amp + 1)}`;
  }
  return ref;
}

interface GitRefTagProps {
  /** 主展示文案（分支/标签名） */
  label: string;
  /** 额外 refs 数量，展示为「 +N」（不参与前省略） */
  extraCount?: number;
  /** 悬停纯文本；与 tooltipContent 二选一 */
  tooltip?: string;
  /** 悬停富内容（如多枚完整 ref 徽章列表） */
  tooltipContent?: ReactNode;
  /**
   * true：强制全量、绝不省略。
   * false：按行内剩余空间自适应——够宽则全文，不够才前省略。
   */
  expand?: boolean;
  /**
   * 与 expand 联用：详情区长 ref 在徽章内换行（参考 SourceGit），
   * 而非单行撑破或裁切。
   */
  wrap?: boolean;
  /** 是否启用悬停提示；默认：未展开时开启，展开且有 +N 时开启 */
  showHoverTooltip?: boolean;
  className?: string;
  /** 有 onClick 时渲染为 button，否则为纯展示 span */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
}

/**
 * 历史 / 详情共用的分支·标签徽章：
 * bg-muted 圆角胶囊 + primary Tag 图标。
 */
export function GitRefTag({
  label,
  extraCount = 0,
  tooltip,
  tooltipContent,
  expand = false,
  wrap = false,
  showHoverTooltip,
  className,
  onClick,
  children,
}: GitRefTagProps) {
  const tipBody = tooltipContent ?? tooltip ?? label;
  const hoverEnabled = showHoverTooltip ?? (!expand || extraCount > 0);
  const richTooltip = tooltipContent != null;
  const extraLabel = extraCount > 0 ? ` +${extraCount}` : "";
  const wrapText = wrap && expand;

  const content = (
    <>
      <Tag
        className={cn("text-primary size-3 shrink-0", wrapText && "mt-0.5")}
        aria-hidden="true"
      />
      {wrapText ? (
        <span className="min-w-0 flex-1 text-left font-mono text-[11px] leading-snug break-all">
          {label}
        </span>
      ) : (
        // 同一 TruncateStartPath：展开用 disabled 显示全文，避免切换时卸载闪烁
        <TruncateStartPath
          path={label}
          title=""
          disabled={expand}
          className="text-[11px] leading-none"
        />
      )}
      {extraCount > 0 ? (
        <span className="shrink-0 text-[11px] leading-none whitespace-nowrap">{extraLabel}</span>
      ) : null}
      {children}
    </>
  );

  const shellClassName = cn(
    "bg-muted text-foreground inline-flex gap-1 rounded-md border-0 px-1.5",
    wrapText ? "h-auto max-w-full min-w-0 items-start py-1" : "h-5 items-center",
    expand && !wrapText
      ? // 强制展开：宽度随全文
        "w-max shrink-0"
      : !expand
        ? // 折叠：药丸随内容；上限预算槽。截断串已按 DOM 量宽，无需再 overflow 裁半字
          "min-w-0 w-max max-w-full"
        : null,
    onClick && "hover:bg-accent cursor-pointer transition-colors",
    className,
  );

  const shell = onClick ? (
    <button type="button" className={shellClassName} onClick={onClick}>
      {content}
    </button>
  ) : (
    <span className={shellClassName}>{content}</span>
  );

  if (!hoverEnabled || tipBody == null || tipBody === "") {
    return shell;
  }

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{shell}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className={cn(
          richTooltip
            ? "border-border bg-popover text-popover-foreground max-w-sm border px-2 py-1.5 shadow-md [&_svg]:bg-popover [&_svg]:fill-popover"
            : "max-w-xs break-all",
        )}
      >
        {tipBody}
      </TooltipContent>
    </Tooltip>
  );
}

interface CopyableGitRefTagProps {
  refName: string;
  /**
   * 详情区默认全文展示。
   * 历史列表的「展开分支名」只影响 HistoryList，不得传到此处。
   */
  expand?: boolean;
  /** 详情区：长分支名在徽章内换行 */
  wrap?: boolean;
  className?: string;
}

/** 可点击复制的 ref 徽章（历史详情等）；默认全文，不受列表视图偏好控制 */
export function CopyableGitRefTag({
  refName,
  expand = true,
  wrap = false,
  className,
}: CopyableGitRefTagProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copyRef(): Promise<void> {
    try {
      await copyToClipboard(refClipboardText(refName));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      toast.error(toUserMessage(error) || t("repo.copyFailed"));
    }
  }

  return (
    <Tooltip open={copied ? true : undefined} delayDuration={200}>
      <TooltipTrigger asChild>
        <GitRefTag
          label={refName}
          expand={expand}
          wrap={wrap}
          showHoverTooltip={false}
          className={className}
          onClick={() => {
            void copyRef();
          }}
        />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs break-all">
        {copied ? t("repo.copySuccess") : refName}
      </TooltipContent>
    </Tooltip>
  );
}
