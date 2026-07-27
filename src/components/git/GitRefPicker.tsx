import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/** Dialog 内的 ref 选择器：使用与 Dialog 同源的 shadcn Select。 */
export function GitRefPicker({
  id,
  value,
  options,
  disabled = false,
  onValueChange,
  className,
}: GitRefPickerProps) {
  const { t } = useTranslation();
  return (
    <Select value={value} disabled={disabled} onValueChange={onValueChange}>
      <SelectTrigger
        id={id}
        className={cn(
          "bg-background hover:bg-accent hover:text-accent-foreground w-full font-normal",
          "[&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:truncate",
          "[&_[data-slot=select-value]]:text-left [&_[data-slot=select-value]]:font-mono",
          className,
        )}
      >
        <SelectValue placeholder={t("common.pleaseSelect")} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        className="max-h-64 w-[var(--radix-select-trigger-width)]"
      >
        {options.map((option) => (
          <SelectItem key={option.key} value={option.value} className="font-mono">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
