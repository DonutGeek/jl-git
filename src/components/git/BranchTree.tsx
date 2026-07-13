import { ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Folder,
  FolderOpen,
  GitBranch as GitBranchIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { BranchTreeNode } from "@/utils/branchTree";
import { GitBranch } from "@/types/git";

/** 与折叠箭头同宽，保证虚线落在父级箭头中轴下 */
const INDENT_PX = 12;

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
export function BranchGroup({
  icon,
  label,
  open,
  onToggle,
  trailing,
  children,
}: BranchGroupProps) {
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
          <span className="[&_svg]:text-muted-foreground flex shrink-0 [&_svg]:size-3">
            {icon}
          </span>
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
  onCheckout: (branch: GitBranch) => void;
  checkingOutName: string | null;
  disabled: boolean;
}

/** 左侧虚线引导列：落在父级折叠箭头正下方 */
function IndentGuides({ depth }: { depth: number }) {
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

/** 左栏分支树：按 / 分层向右展开 */
export function BranchTree({
  nodes,
  depth,
  variant,
  treeId,
  collapsedPaths,
  onToggleCollapse,
  onCheckout,
  checkingOutName,
  disabled,
}: BranchTreeProps) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => {
        const key = `${treeId}:${node.path}`;
        const isFolder = node.children.length > 0;

        if (!isFolder && node.branch) {
          return (
            <li key={key}>
              <BranchLeaf
                branch={node.branch}
                label={node.segment}
                depth={depth}
                isBusy={checkingOutName === node.branch.name}
                disabled={disabled}
                onCheckout={onCheckout}
              />
            </li>
          );
        }

        const collapsed = collapsedPaths.has(key);
        // remote 名（origin）路径无 /，用云；更深路径段用文件夹
        const isRemoteName = variant === "remote" && node.path === node.segment;

        return (
          <li key={key}>
            <Button
              type="button"
              variant="ghost"
              className="h-7 w-full justify-start gap-1 rounded-md px-1.5 text-left text-xs [&_svg]:size-3"
              onClick={() => onToggleCollapse(key)}
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
              <span className="min-w-0 flex-1 truncate">{node.segment}</span>
            </Button>

            {!collapsed ? (
              <BranchTree
                nodes={node.children}
                depth={depth + 1}
                variant={variant}
                treeId={treeId}
                collapsedPaths={collapsedPaths}
                onToggleCollapse={onToggleCollapse}
                onCheckout={onCheckout}
                checkingOutName={checkingOutName}
                disabled={disabled}
              />
            ) : null}
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
  onCheckout: (branch: GitBranch) => void;
}

function BranchLeaf({ branch, label, depth, isBusy, disabled, onCheckout }: BranchLeafProps) {
  const isCurrent = branch.isCurrent;
  const isDisabled = disabled || isBusy;

  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        "h-7 w-full justify-start gap-1 rounded-md px-1.5 text-left text-xs transition-colors [&_svg]:size-3",
        // 当前分支高亮，不走 disabled（避免 opacity 置灰）
        isCurrent
          ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
          : "text-foreground",
        isCurrent && "pointer-events-none cursor-default",
        isBusy && "cursor-wait",
      )}
      onClick={() => {
        if (isCurrent || isDisabled) {
          return;
        }
        onCheckout(branch);
      }}
      disabled={isDisabled && !isCurrent}
      aria-current={isCurrent ? "true" : undefined}
    >
      <IndentGuides depth={depth} />
      <span className="size-3 shrink-0" aria-hidden="true" />
      {isCurrent ? (
        <Check className="shrink-0" aria-hidden="true" />
      ) : (
        <GitBranchIcon className="text-muted-foreground shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Button>
  );
}
