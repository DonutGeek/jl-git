import type { CSSProperties, ReactNode } from "react";
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
  /** 选项预览样式（如字体名） */
  style?: CSSProperties;
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
  /** 自定义触发器展示；默认取当前选项 label */
  displayLabel?: ReactNode;
  /** sm：工具条紧凑项 */
  size?: "default" | "sm";
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
  const label = displayLabel ?? current?.label ?? value;
  const compact = size === "sm";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            // 与 RepoToolbar 分支选择器一致：边框 + 无阴影
            "border-border h-8 w-full justify-between gap-1.5 border px-2.5 text-sm font-normal shadow-none",
            compact && "h-7 gap-1 px-2 text-xs",
            triggerClassName,
          )}
          style={current?.style}
        >
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
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
        className={cn(
          "min-w-[var(--radix-dropdown-menu-trigger-width)] p-0",
          contentClassName,
        )}
      >
        <ScrollArea className="max-h-64">
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
