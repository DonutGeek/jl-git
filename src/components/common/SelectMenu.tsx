import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
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
 * 项目统一下拉选择：边框/焦点环走 input·ring token，勾选态用 primary（跟应用主题）
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
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger
        size={compact ? "sm" : "default"}
        aria-label={ariaLabel}
        title={typeof displayLabel === "undefined" ? fullLabel : undefined}
        className={cn(
          "bg-background hover:bg-accent hover:text-accent-foreground h-8 w-full gap-1.5 px-2.5 text-sm font-normal",
          compact && "h-7 gap-1 px-2 text-xs",
          triggerClassName,
        )}
        style={current?.style}
      >
        {triggerLabel}
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        className={cn(
          "max-h-[min(16rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)]",
          contentClassName,
        )}
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className={compact ? "text-xs" : "text-sm"}
            style={option.style}
          >
            {option.preview ? (
              <span className="shrink-0">{option.preview}</span>
            ) : null}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
