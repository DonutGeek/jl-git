import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  PROJECT_ICON_OPTIONS,
  ProjectIcon,
} from "@/components/project/ProjectIcon";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { ProjectIcon as ProjectIconName } from "@/types/project";

interface ProjectIconPickerProps {
  value: ProjectIconName;
  onValueChange: (value: ProjectIconName) => void;
  disabled?: boolean;
  id?: string;
}

export function ProjectIconPicker({
  value,
  onValueChange,
  disabled = false,
  id,
}: ProjectIconPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selectedLabel = t(`projectManager.projectIcons.${value}`);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={t("projectManager.projectIcon")}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ProjectIcon name={value} className="shrink-0" />
            <span className="truncate">{selectedLabel}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-0"
      >
        <Command>
          <CommandInput
            placeholder={t("projectManager.searchProjectIcons")}
            aria-label={t("projectManager.searchProjectIcons")}
          />
          <CommandList className="max-h-40">
            <CommandEmpty>{t("projectManager.projectIconNoMatch")}</CommandEmpty>
            <CommandGroup
              className="[&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-6 [&_[cmdk-group-items]]:gap-0.5"
            >
              {PROJECT_ICON_OPTIONS.map(({ value: optionValue, Icon }) => {
                const label = t(`projectManager.projectIcons.${optionValue}`);
                const selected = optionValue === value;

                return (
                  <CommandItem
                    key={optionValue}
                    value={`${label} ${optionValue}`}
                    title={label}
                    aria-label={label}
                    className={cn(
                      "relative aspect-square justify-center p-0",
                      selected && "bg-accent ring-border ring-1",
                    )}
                    onSelect={() => {
                      onValueChange(optionValue);
                      setOpen(false);
                    }}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span className="sr-only">{label}</span>
                    {selected ? (
                      <Check
                        className="text-primary absolute right-0.5 bottom-0.5 size-2.5"
                        aria-hidden="true"
                      />
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
