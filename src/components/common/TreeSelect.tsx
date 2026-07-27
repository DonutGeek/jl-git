import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, ChevronsUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface TreeSelectNode {
  value: string;
  label: string;
  children?: readonly TreeSelectNode[];
  disabled?: boolean;
}

interface TreeSelectProps {
  value: string;
  onChange: (value: string) => void;
  nodes: readonly TreeSelectNode[];
  ariaLabel: string;
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
  /** 受控打开状态 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 树顶可选的空值项（如「未分组」「根分组」） */
  emptyOption?: { value: string; label: string; icon?: ReactNode };
  /** 触发器左侧图标 */
  triggerIcon?: ReactNode;
  /** 节点行左侧图标 */
  nodeIcon?: ReactNode;
  /** 面板底部附加区（如「添加分组」） */
  footer?: ReactNode;
  /** 自定义触发器文案；默认 empty/node label */
  displayLabel?: ReactNode;
  /** 打开时默认展开全部节点 */
  defaultExpandAll?: boolean;
}

function collectAllExpandableIds(nodes: readonly TreeSelectNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      ids.push(node.value);
      ids.push(...collectAllExpandableIds(node.children));
    }
  }
  return ids;
}

function collectAncestorIds(
  nodes: readonly TreeSelectNode[],
  value: string,
  trail: string[] = [],
): string[] | null {
  for (const node of nodes) {
    if (node.value === value) {
      return trail;
    }
    if (node.children?.length) {
      const found = collectAncestorIds(node.children, value, [...trail, node.value]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function findNodeLabel(nodes: readonly TreeSelectNode[], value: string): string | null {
  for (const node of nodes) {
    if (node.value === value) {
      return node.label;
    }
    if (node.children?.length) {
      const nested = findNodeLabel(node.children, value);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

interface TreeRowsProps {
  nodes: readonly TreeSelectNode[];
  depth: number;
  value: string;
  expandedIds: ReadonlySet<string>;
  nodeIcon?: ReactNode;
  expandLabel: string;
  collapseLabel: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

function TreeRows({
  nodes,
  depth,
  value,
  expandedIds,
  nodeIcon,
  expandLabel,
  collapseLabel,
  onToggle,
  onSelect,
}: TreeRowsProps) {
  return (
    <>
      {nodes.map((node) => {
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const expanded = expandedIds.has(node.value);
        const selected = node.value === value;

        return (
          <div key={node.value}>
            <div
              className="flex items-center gap-0.5"
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
            >
              {hasChildren ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground size-6 shrink-0"
                  aria-label={expanded ? collapseLabel : expandLabel}
                  aria-expanded={expanded}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggle(node.value);
                  }}
                >
                  {expanded ? (
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                  )}
                </Button>
              ) : (
                <span className="size-6 shrink-0" aria-hidden="true" />
              )}
              <button
                type="button"
                disabled={node.disabled}
                role="option"
                aria-selected={selected}
                className={cn(
                  "hover:bg-accent hover:text-accent-foreground flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 text-left text-sm outline-none",
                  "focus-visible:ring-ring focus-visible:ring-2",
                  selected && "bg-accent text-accent-foreground",
                  node.disabled && "pointer-events-none opacity-50",
                )}
                onClick={() => onSelect(node.value)}
              >
                {nodeIcon ? <span className="shrink-0">{nodeIcon}</span> : null}
                <span className="min-w-0 flex-1 truncate">{node.label}</span>
                {selected ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            </div>
            {hasChildren && expanded ? (
              <TreeRows
                nodes={node.children ?? []}
                depth={depth + 1}
                value={value}
                expandedIds={expandedIds}
                nodeIcon={nodeIcon}
                expandLabel={expandLabel}
                collapseLabel={collapseLabel}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/**
 * 通用树形选择器（领域封装，非 shadcn 官方件）。
 * 官方无 Tree Select；基于 Popover + ScrollArea 组合。
 */
export function TreeSelect({
  value,
  onChange,
  nodes,
  ariaLabel,
  disabled = false,
  triggerClassName,
  contentClassName,
  open: openProp,
  onOpenChange,
  emptyOption,
  triggerIcon,
  nodeIcon,
  footer,
  displayLabel,
  defaultExpandAll = true,
}: TreeSelectProps) {
  const { t } = useTranslation();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const selectedLabel = useMemo(() => {
    if (emptyOption && value === emptyOption.value) {
      return emptyOption.label;
    }
    return findNodeLabel(nodes, value) ?? value;
  }, [emptyOption, nodes, value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (defaultExpandAll) {
      setExpandedIds(new Set(collectAllExpandableIds(nodes)));
      return;
    }
    const ancestors = collectAncestorIds(nodes, value) ?? [];
    setExpandedIds(new Set(ancestors));
  }, [open, nodes, value, defaultExpandAll]);

  function toggleExpanded(id: string): void {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelect(next: string): void {
    onChange(next);
    setOpen(false);
  }

  const emptySelected = Boolean(emptyOption && value === emptyOption.value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          title={typeof displayLabel === "undefined" ? selectedLabel : undefined}
          className={cn(
            "bg-background hover:bg-accent hover:text-accent-foreground h-9 w-full justify-between gap-1.5 px-2.5 font-normal",
            triggerClassName,
          )}
        >
          {displayLabel ?? (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
              {triggerIcon ? <span className="shrink-0">{triggerIcon}</span> : null}
              <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
            </span>
          )}
          <ChevronsUpDown
            className="text-muted-foreground size-4 shrink-0 opacity-50"
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-[var(--radix-popover-trigger-width)] p-0", contentClassName)}
      >
        {/* max-h + viewport h-auto：矮列表随内容收缩，多选项再滚动 */}
        <ScrollArea className="max-h-64 [&_[data-slot=scroll-area-viewport]]:h-auto [&_[data-slot=scroll-area-viewport]]:max-h-64">
          <div role="listbox" aria-label={ariaLabel} className="flex flex-col gap-0.5 p-1">
            {emptyOption ? (
              <button
                type="button"
                role="option"
                aria-selected={emptySelected}
                className={cn(
                  "hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm outline-none",
                  "focus-visible:ring-ring focus-visible:ring-2",
                  emptySelected && "bg-accent text-accent-foreground",
                )}
                onClick={() => handleSelect(emptyOption.value)}
              >
                {emptyOption.icon ? <span className="shrink-0">{emptyOption.icon}</span> : null}
                <span className="min-w-0 flex-1 truncate">{emptyOption.label}</span>
                {emptySelected ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            ) : null}

            <TreeRows
              nodes={nodes}
              depth={0}
              value={value}
              expandedIds={expandedIds}
              nodeIcon={nodeIcon}
              expandLabel={t("common.expand")}
              collapseLabel={t("common.collapse")}
              onToggle={toggleExpanded}
              onSelect={handleSelect}
            />
          </div>
        </ScrollArea>
        {footer ? (
          <>
            <Separator />
            <div className="p-1">{footer}</div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
