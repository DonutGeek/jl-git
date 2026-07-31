import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  Folder,
  FolderOpen,
  GitBranch as GitBranchIcon,
} from "lucide-react";

import { HighlightText } from "@/components/common/HighlightText";
import {
  BranchContextMenuContent,
  type BranchContextActions,
} from "@/components/git/BranchContextMenuContent";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { GitBranch } from "@/types/git";
import type { BranchTreeNode } from "@/utils/branchTree";
import { useContextMenuOpen } from "@/utils/contextMenuHighlight";
import { withSoftWrapOpportunities } from "@/utils/softWrapText";

export type { BranchContextActions };

/** 与折叠箭头同宽，保证虚线落在父级箭头中轴下 */
const INDENT_PX = 12;

/** 分支树虚拟列表可见行（不含 local/remote 分组头） */
export type BranchVisibleRow =
  | {
      kind: "folder";
      id: string;
      segment: string;
      depth: number;
      collapsed: boolean;
      variant: "local" | "remote";
      isRemoteName: boolean;
    }
  | {
      kind: "branch";
      id: string;
      branch: GitBranch;
      label: string;
      depth: number;
      variant: "local" | "remote";
    };

/** 按折叠状态展平分支树 */
export function flattenBranchTreeRows(
  nodes: BranchTreeNode[],
  treeId: string,
  variant: "local" | "remote",
  depth: number,
  collapsedPaths: ReadonlySet<string>,
): BranchVisibleRow[] {
  const rows: BranchVisibleRow[] = [];

  for (const node of nodes) {
    const id = `${treeId}:${node.path}`;
    const isFolder = node.children.length > 0;

    if (!isFolder && node.branch) {
      rows.push({
        kind: "branch",
        id,
        branch: node.branch,
        label: node.segment,
        depth,
        variant,
      });
      continue;
    }

    const collapsed = collapsedPaths.has(id);
    rows.push({
      kind: "folder",
      id,
      segment: node.segment,
      depth,
      collapsed,
      variant,
      isRemoteName: variant === "remote" && node.path === node.segment,
    });

    if (!collapsed) {
      rows.push(
        ...flattenBranchTreeRows(node.children, treeId, variant, depth + 1, collapsedPaths),
      );
    }
  }

  return rows;
}

interface BranchGroupProps {
  icon: ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  /** 行尾操作（如远端右侧 +） */
  trailing?: ReactNode;
  children?: ReactNode;
}

/**
 * 本地/远端分组根节点：整行统一 hover，避免按钮与右侧 + 各亮一块。
 */
export function BranchGroup({ icon, label, open, onToggle, trailing, children }: BranchGroupProps) {
  return (
    <div>
      <div className="hover:bg-accent/60 group flex h-7 items-center rounded-md">
        <button
          type="button"
          className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs"
          onClick={onToggle}
        >
          {open ? (
            <ChevronDown className="text-muted-foreground size-3 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="text-muted-foreground size-3 shrink-0" aria-hidden="true" />
          )}
          <span className="[&_svg]:text-muted-foreground flex shrink-0 [&_svg]:size-3">{icon}</span>
          <span className="text-foreground min-w-0 flex-1 truncate">{label}</span>
        </button>
        {trailing ? (
          <div className="flex shrink-0 items-center pr-0.5 opacity-70 group-hover:opacity-100">
            {trailing}
          </div>
        ) : null}
      </div>
      {open ? children : null}
    </div>
  );
}

interface BranchTreeProps {
  nodes: BranchTreeNode[];
  depth: number;
  /** local：路径段用文件夹；remote：remote 名用云图标 */
  variant: "local" | "remote";
  treeId: string;
  collapsedPaths: Set<string>;
  onToggleCollapse: (key: string) => void;
  onSelect: (branch: GitBranch) => void;
  onCheckout: (branch: GitBranch) => void;
  contextActions: BranchContextActions;
  selectedName: string | null;
  checkingOutName: string | null;
  disabled: boolean;
  /** 当前分支相对 upstream 超前提交数；与工具栏推送禁用条件对齐 */
  aheadCount?: number;
  /** 判断本地分支是否已发布；仅 local 树使用 */
  isPublished?: (branch: GitBranch) => boolean;
  /** 侧栏搜索高亮 */
  highlightQuery?: string;
}

/** 左侧虚线引导列：落在父级折叠箭头正下方 */
export function IndentGuides({ depth }: { depth: number }) {
  if (depth <= 0) {
    return null;
  }

  return (
    <span className="flex h-full shrink-0 self-stretch" aria-hidden="true">
      {Array.from({ length: depth }, (_, index) => (
        <span key={index} className="relative shrink-0" style={{ width: INDENT_PX }}>
          <span className="border-border/70 absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-dashed" />
        </span>
      ))}
    </span>
  );
}

/** 文件夹 / remote 名行（供虚拟列表复用） */
export function BranchFolderRow({
  segment,
  depth,
  collapsed,
  isRemoteName,
  onToggle,
  highlightQuery = "",
}: {
  segment: string;
  depth: number;
  collapsed: boolean;
  isRemoteName: boolean;
  onToggle: () => void;
  highlightQuery?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-7 w-full min-w-0 justify-start gap-1 overflow-hidden rounded-md px-1.5 text-left text-xs [&_svg]:size-3"
      onClick={onToggle}
    >
      <IndentGuides depth={depth} />
      {collapsed ? (
        <ChevronRight className="text-muted-foreground shrink-0" aria-hidden="true" />
      ) : (
        <ChevronDown className="text-muted-foreground shrink-0" aria-hidden="true" />
      )}
      {isRemoteName ? (
        <Cloud className="text-muted-foreground shrink-0" aria-hidden="true" />
      ) : collapsed ? (
        <Folder className="text-muted-foreground shrink-0" aria-hidden="true" />
      ) : (
        <FolderOpen className="text-muted-foreground shrink-0" aria-hidden="true" />
      )}
      <HighlightText text={segment} query={highlightQuery} className="min-w-0 flex-1 truncate" />
    </Button>
  );
}

/** 左栏分支树：按 / 分层向右展开（非虚拟路径，测试/简单复用） */
export function BranchTree({
  nodes,
  depth,
  variant,
  treeId,
  collapsedPaths,
  onToggleCollapse,
  onSelect,
  onCheckout,
  contextActions,
  selectedName,
  checkingOutName,
  disabled,
  aheadCount = 0,
  isPublished,
  highlightQuery = "",
}: BranchTreeProps) {
  const rows = flattenBranchTreeRows(nodes, treeId, variant, depth, collapsedPaths);

  return (
    <ul className="flex flex-col">
      {rows.map((row) => {
        if (row.kind === "folder") {
          return (
            <li key={row.id}>
              <BranchFolderRow
                segment={row.segment}
                depth={row.depth}
                collapsed={row.collapsed}
                isRemoteName={row.isRemoteName}
                onToggle={() => onToggleCollapse(row.id)}
                highlightQuery={highlightQuery}
              />
            </li>
          );
        }

        const published = row.variant === "remote" ? true : (isPublished?.(row.branch) ?? true);
        return (
          <li key={row.id}>
            <BranchLeaf
              branch={row.branch}
              label={row.label}
              depth={row.depth}
              isBusy={checkingOutName === row.branch.name}
              disabled={disabled}
              published={published}
              selected={selectedName === row.branch.name}
              aheadCount={aheadCount}
              onSelect={onSelect}
              onCheckout={onCheckout}
              contextActions={contextActions}
              highlightQuery={highlightQuery}
            />
          </li>
        );
      })}
    </ul>
  );
}

interface BranchLeafProps {
  branch: GitBranch;
  label: string;
  depth: number;
  isBusy: boolean;
  disabled: boolean;
  published: boolean;
  selected: boolean;
  aheadCount: number;
  onSelect: (branch: GitBranch) => void;
  onCheckout: (branch: GitBranch) => void;
  contextActions: BranchContextActions;
  highlightQuery?: string;
}

export function BranchLeaf({
  branch,
  label,
  depth,
  isBusy,
  disabled,
  published,
  selected,
  aheadCount,
  onSelect,
  onCheckout,
  contextActions,
  highlightQuery = "",
}: BranchLeafProps) {
  const { t } = useTranslation();
  const isCurrent = branch.isCurrent;
  const isRemote = branch.isRemote;
  const isDisabled = disabled || isBusy;
  const canCheckout = !isCurrent && !isDisabled;
  const hasTrackingBranch = !isRemote && Boolean(branch.upstream);
  const { menuOpen, onOpenChange } = useContextMenuOpen(() => {
    if (!isDisabled) {
      onSelect(branch);
    }
  });

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <ContextMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "h-7 w-full min-w-0 justify-start gap-1 overflow-hidden rounded-md px-1.5 text-left text-xs transition-colors [&_svg]:size-3",
                isCurrent
                  ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : selected || menuOpen
                    ? "bg-accent text-foreground hover:bg-accent"
                    : "text-foreground",
                isBusy && "cursor-wait",
              )}
              onClick={() => {
                if (isDisabled) {
                  return;
                }
                onSelect(branch);
              }}
              onDoubleClick={() => {
                if (!canCheckout) {
                  return;
                }
                onCheckout(branch);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && selected && canCheckout) {
                  event.preventDefault();
                  onCheckout(branch);
                }
              }}
              disabled={isDisabled && !isCurrent}
              aria-current={isCurrent ? "true" : undefined}
              aria-selected={selected}
            >
              <IndentGuides depth={depth} />
              <span className="size-3 shrink-0" aria-hidden="true" />
              {isBusy ? (
                <Spinner className="size-3 shrink-0" />
              ) : isCurrent ? (
                <Check className="shrink-0" aria-hidden="true" />
              ) : published ? (
                <GitBranchIcon className="text-muted-foreground shrink-0" aria-hidden="true" />
              ) : (
                <CloudOff className="text-muted-foreground shrink-0" aria-hidden="true" />
              )}
              <HighlightText
                text={label}
                query={highlightQuery}
                className="min-w-0 flex-1 truncate"
              />
              {!published && !isRemote ? (
                <span className="text-muted-foreground shrink-0 text-[10px]">
                  {t("repo.branchUnpublished")}
                </span>
              ) : null}
            </Button>
          </ContextMenuTrigger>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-96 font-mono whitespace-normal break-words"
          side="right"
          sideOffset={6}
        >
          <p>{withSoftWrapOpportunities(t("repo.branchTooltipName", { name: branch.name }))}</p>
          {hasTrackingBranch ? (
            <p>
              {withSoftWrapOpportunities(
                t("repo.branchTooltipUpstream", { upstream: branch.upstream }),
              )}
            </p>
          ) : null}
        </TooltipContent>
      </Tooltip>

      <BranchContextMenuContent
        branch={branch}
        disabled={isDisabled}
        published={published}
        aheadCount={aheadCount}
        contextActions={contextActions}
      />
    </ContextMenu>
  );
}
