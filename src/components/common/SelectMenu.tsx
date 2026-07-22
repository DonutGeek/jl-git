import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface SelectMenuOption {
  value: string;
  label: string;
  /** 触发器空间不足时的缩写；下拉仍用 label */
  shortLabel?: string;
  /** 选项预览样式（如字体名） */
  style?: CSSProperties;
  preview?: ReactNode;
}

interface SelectMenuProps {
  value: string;
  options: readonly SelectMenuOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** 触发器额外 class */
  triggerClassName?: string;
  contentClassName?: string;
  /** 自定义触发器展示；默认取当前选项 label（可自适应 shortLabel） */
  displayLabel?: ReactNode;
  /** sm：工具条紧凑项 */
  size?: "default" | "sm";
}

/** 宽度不够时切到短文案，够用时显示全文 */
function AdaptiveTriggerLabel({
  full,
  short,
}: {
  full: string;
  short: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) {
      return;
    }

    const update = (): void => {
      setCompact(measure.scrollWidth > container.clientWidth + 1);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [full, short]);

  const text = compact ? short : full;

  return (
    <span
      ref={containerRef}
      className="relative min-w-0 flex-1 truncate text-left"
      title={full}
    >
      <span
        ref={measureRef}
        className="invisible absolute top-0 left-0 whitespace-nowrap"
        aria-hidden="true"
      >
        {full}
      </span>
      <span className="truncate">{text}</span>
    </span>
  );
}

/**
 * 项目统一下拉选择：轻边框触发器 + 勾选当前项（对齐顶栏分支选择器）
 */
export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  triggerClassName,
  contentClassName,
  displayLabel,
  size = "default",
}: SelectMenuProps) {
  const current = options.find((option) => option.value === value);
  const compact = size === "sm";
  const shortLabel = current?.shortLabel?.trim();
  const fullLabel = current?.label ?? value;

  const triggerLabel =
    displayLabel ??
    (shortLabel ? (
      <AdaptiveTriggerLabel full={fullLabel} short={shortLabel} />
    ) : (
      <span className="min-w-0 flex-1 truncate text-left">{fullLabel}</span>
    ));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          aria-label={ariaLabel}
          title={typeof displayLabel === "undefined" ? fullLabel : undefined}
          className={cn(
            "border-border h-8 w-full justify-between gap-1.5 border px-2.5 text-sm font-normal shadow-none",
            compact && "h-7 gap-1 px-2 text-xs",
            triggerClassName,
          )}
          style={current?.style}
        >
          {triggerLabel}
          <ChevronDown
            className={cn(
              "text-muted-foreground shrink-0",
              compact ? "size-3" : "size-3.5",
            )}
            aria-hidden="true"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        // 禁止 Content 自身滚动，交由内部 ScrollArea，避免长列表撑满屏却无滚动条
        className={cn(
          "max-h-[min(16rem,var(--radix-dropdown-menu-content-available-height))] min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-hidden p-0",
          contentClassName,
        )}
      >
        <ScrollArea className="h-full max-h-[min(16rem,var(--radix-dropdown-menu-content-available-height))]">
          <div className="p-1">
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <DropdownMenuItem
                  key={option.value}
                  className={cn("gap-2", compact ? "text-xs" : "text-sm")}
                  style={option.style}
                  onSelect={() => onChange(option.value)}
                >
                  {option.preview ? <span className="shrink-0">{option.preview}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {selected ? (
                    <Check
                      className={cn(
                        "text-primary shrink-0",
                        compact ? "size-3" : "size-3.5",
                      )}
                      aria-hidden="true"
                    />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
