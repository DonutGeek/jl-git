import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface GitRefPickerOption {
  /** 唯一键（可与 value 相同） */
  key: string;
  /** 展示与提交用的 ref 名 */
  value: string;
  label: string;
}

interface GitRefPickerProps {
  id?: string;
  value: string;
  options: readonly GitRefPickerOption[];
  disabled?: boolean;
  onValueChange: (value: string) => void;
  /** 触发器额外 class */
  className?: string;
}

/**
 * Dialog 内的 ref 选择器。
 * 不用 Radix Select：与 Dialog（radix-ui）叠用时 dismissable-layer 双版本会导致悬停高亮失效。
 */
export function GitRefPicker({
  id,
  value,
  options,
  disabled = false,
  onValueChange,
  className,
}: GitRefPickerProps) {
  const { t } = useTranslation();
  const selected = options.find((option) => option.value === value);
  const display = selected?.label ?? "";

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between px-3 font-normal shadow-sm",
            className,
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left font-mono text-sm",
              !display && "text-muted-foreground font-sans",
            )}
          >
            {display || t("common.pleaseSelect")}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
      >
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <DropdownMenuItem
              key={option.key}
              className="font-mono"
              onSelect={() => onValueChange(option.value)}
            >
              <Check
                className={cn(
                  "size-3.5 shrink-0",
                  isSelected ? "opacity-100" : "opacity-0",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
