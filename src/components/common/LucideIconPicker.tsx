import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";

import { HighlightText } from "@/components/common/HighlightText";
import { LucideDynamicIcon } from "@/components/common/LucideDynamicIcon";
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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  filterLucideIconNames,
  formatLucideIconLabel,
  LUCIDE_ICON_GRID_COLUMNS,
  LUCIDE_ICON_NAMES,
  LUCIDE_ICON_PAGE_SIZE,
} from "@/utils/lucideIconRegistry";
import { buildManagePageItems } from "@/utils/projectManageFilter";

export interface LucideIconPickerProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  /** 触发器 / 区域 aria-label */
  ariaLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  /** 覆盖个别图标展示名（如 i18n 常用图标） */
  labelForName?: (name: string) => string | undefined;
  /** 触发器额外 class（如高度微调） */
  triggerClassName?: string;
}

/** 正方形圆角页码格；强制等宽高，避免三位数把按钮撑扁长 */
const PAGE_BUTTON_CLASS =
  "size-7 min-h-7 max-h-7 min-w-7 max-w-7 shrink-0 rounded-md p-0 text-xs tabular-nums leading-none [&>svg]:size-3.5";

/** 全量 Lucide 图标选择：搜索防抖 + 6×5 正方形圆角格子 + 页码分页（‹ 页码 ›） */
export function LucideIconPicker({
  value,
  onValueChange,
  disabled = false,
  id,
  ariaLabel,
  searchPlaceholder,
  emptyLabel,
  labelForName,
  triggerClassName,
}: LucideIconPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(
    () => filterLucideIconNames(debouncedQuery, LUCIDE_ICON_NAMES),
    [debouncedQuery],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / LUCIDE_ICON_PAGE_SIZE));
  const pageItems = useMemo(() => buildManagePageItems(page, pageCount), [page, pageCount]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, filtered.length]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const visibleIcons = useMemo(() => {
    const start = (page - 1) * LUCIDE_ICON_PAGE_SIZE;
    return filtered.slice(start, start + LUCIDE_ICON_PAGE_SIZE);
  }, [filtered, page]);

  function resolveLabel(name: string): string {
    return labelForName?.(name) ?? formatLucideIconLabel(name);
  }

  function goToPage(next: number): void {
    setPage(Math.min(pageCount, Math.max(1, next)));
  }

  const selectedLabel = resolveLabel(value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setDebouncedQuery("");
          setPage(1);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn("h-9 w-full justify-between font-normal shadow-none", triggerClassName)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <LucideDynamicIcon name={value} className="shrink-0" />
            <span className="truncate">{selectedLabel}</span>
          </span>
          <ChevronsUpDown
            className="text-muted-foreground size-4 shrink-0 opacity-50"
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          <CommandList className="max-h-none overflow-hidden">
            {filtered.length === 0 ? (
              <CommandEmpty>{emptyLabel}</CommandEmpty>
            ) : (
              <CommandGroup
                className={cn(
                  "p-1.5 [&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:gap-1",
                  LUCIDE_ICON_GRID_COLUMNS === 6
                    ? "[&_[cmdk-group-items]]:grid-cols-6"
                    : "[&_[cmdk-group-items]]:grid-cols-5",
                )}
              >
                {visibleIcons.map((name) => {
                  const label = resolveLabel(name);
                  const selected = name === value;
                  return (
                    <Tooltip key={name} delayDuration={300}>
                      <TooltipTrigger asChild>
                        <CommandItem
                          value={name}
                          aria-label={label}
                          className={cn(
                            // 正方形圆角选中区；清掉 CommandItem 默认横向 padding
                            "relative aspect-square w-full justify-center rounded-md !p-0",
                            selected && "bg-accent ring-border ring-1",
                          )}
                          onSelect={() => {
                            onValueChange(name);
                            setOpen(false);
                          }}
                        >
                          <LucideDynamicIcon name={name} className="size-4" />
                          <HighlightText text={label} query={debouncedQuery} className="sr-only" />
                          {selected ? (
                            <Check
                              className="text-primary absolute right-0.5 bottom-0.5 size-2.5"
                              aria-hidden="true"
                            />
                          ) : null}
                        </CommandItem>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <HighlightText text={label} query={debouncedQuery} />
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
          {filtered.length > 0 ? (
            <div className="border-border border-t px-1 py-1.5">
              <Pagination
                className="mx-0 w-full justify-center"
                aria-label={t("projectManager.iconPickerPagination")}
              >
                <PaginationContent className="flex-nowrap items-center gap-1">
                  <PaginationItem className="inline-flex">
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <PaginationLink
                          href="#"
                          size="icon"
                          aria-label={t("projectManager.iconPickerPrevPage")}
                          aria-disabled={page <= 1}
                          className={cn(
                            PAGE_BUTTON_CLASS,
                            page <= 1 && "pointer-events-none opacity-50",
                          )}
                          onClick={(event) => {
                            event.preventDefault();
                            if (page > 1) {
                              goToPage(page - 1);
                            }
                          }}
                        >
                          <ChevronLeft aria-hidden="true" />
                        </PaginationLink>
                      </TooltipTrigger>
                      <TooltipContent>{t("projectManager.iconPickerPrevPage")}</TooltipContent>
                    </Tooltip>
                  </PaginationItem>
                  {pageItems.map((item, index) =>
                    item === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${index}`} className="inline-flex">
                        <PaginationEllipsis className="flex size-7 min-w-7 items-center justify-center" />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item} className="inline-flex">
                        <PaginationLink
                          href="#"
                          size="icon"
                          isActive={item === page}
                          aria-label={t("projectManager.iconPickerGoToPage", { page: item })}
                          className={PAGE_BUTTON_CLASS}
                          onClick={(event) => {
                            event.preventDefault();
                            goToPage(item);
                          }}
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem className="inline-flex">
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <PaginationLink
                          href="#"
                          size="icon"
                          aria-label={t("projectManager.iconPickerNextPage")}
                          aria-disabled={page >= pageCount}
                          className={cn(
                            PAGE_BUTTON_CLASS,
                            page >= pageCount && "pointer-events-none opacity-50",
                          )}
                          onClick={(event) => {
                            event.preventDefault();
                            if (page < pageCount) {
                              goToPage(page + 1);
                            }
                          }}
                        >
                          <ChevronRight aria-hidden="true" />
                        </PaginationLink>
                      </TooltipTrigger>
                      <TooltipContent>{t("projectManager.iconPickerNextPage")}</TooltipContent>
                    </Tooltip>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
