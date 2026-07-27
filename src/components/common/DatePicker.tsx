import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DatePickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

/** 将 YYYY-MM-DD 解析为本地日历日，避免 UTC 偏移 */
function parseYmd(value: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!matched) {
    return undefined;
  }
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 单日日期选择器：值契约为 YYYY-MM-DD | null */
export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled = false,
  id,
  className,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const resolvedPlaceholder =
    placeholder ?? t("common.datePickerPlaceholder");
  const selected = parseYmd(value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel ?? resolvedPlaceholder}
          data-empty={!value}
          className={cn(
            "h-8 w-full justify-start px-2.5 text-left text-xs font-normal shadow-none",
            "data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
          <span className="min-w-0 truncate">
            {value ?? resolvedPlaceholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        // 嵌套在筛选 Popover 内时避免抢焦点导致外层关闭异常
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? formatYmd(date) : null);
            setOpen(false);
          }}
        />
        {value ? (
          <div className="border-border border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              {t("common.datePickerClear")}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
