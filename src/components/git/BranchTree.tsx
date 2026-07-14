import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Folder,
  FolderOpen,
  GitCompareArrows,
  GitBranch as GitBranchIcon,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

import { BranchTreeNode } from "@/utils/branchTree";
import { GitBranch } from "@/types/git";

/** 分支行右键菜单动作 */
export interface BranchContextActions {
  onCheckout: (branch: GitBranch) => void;
  onPull: (branch: GitBranch) => void;
  onPush: (branch: GitBranch) => void;
  onPublish: (branch: GitBranch) => void;
  onRename: (branch: GitBranch) => void;
  onCopyName: (branch: GitBranch) => void;
  onCompareWithCurrent: (branch: GitBranch) => void;
  canCompareWithCurrent: (branch: GitBranch) => boolean;
  onDelete: (branch: GitBranch) => void;
}

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
  onSelect,
  onCheckout,
  contextActions,
  selectedName,
  checkingOutName,
  disabled,
  aheadCount = 0,
  isPublished,
}: BranchTreeProps) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => {
        const key = `${treeId}:${node.path}`;
        const isFolder = node.children.length > 0;

        if (!isFolder && node.branch) {
          const published =
            variant === "remote" ? true : (isPublished?.(node.branch) ?? true);
          return (
            <li key={key}>
              <BranchLeaf
                branch={node.branch}
                label={node.segment}
                depth={depth}
                isBusy={checkingOutName === node.branch.name}
                disabled={disabled}
                published={published}
                selected={selectedName === node.branch.name}
                aheadCount={aheadCount}
                onSelect={onSelect}
                onCheckout={onCheckout}
                contextActions={contextActions}
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
                onSelect={onSelect}
                onCheckout={onCheckout}
                contextActions={contextActions}
                selectedName={selectedName}
                checkingOutName={checkingOutName}
                disabled={disabled}
                aheadCount={aheadCount}
                isPublished={isPublished}
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
  published: boolean;
  selected: boolean;
  aheadCount: number;
  onSelect: (branch: GitBranch) => void;
  onCheckout: (branch: GitBranch) => void;
  contextActions: BranchContextActions;
}

function BranchLeaf({
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
}: BranchLeafProps) {
  const { t } = useTranslation();
  const isCurrent = branch.isCurrent;
  const isRemote = branch.isRemote;
  const isDisabled = disabled || isBusy;
  const canCheckout = !isCurrent && !isDisabled;
  // 与工具栏对齐：已发布才可更新；有超前提交才可推送；未发布显示发布
  const canPull = isCurrent && !isRemote && published && !isDisabled;
  const canPublish = isCurrent && !isRemote && !published && !isDisabled;
  const canPush = isCurrent && !isRemote && published && aheadCount > 0 && !isDisabled;
  const canRename = !isRemote && !isDisabled;
  const canDelete = !isRemote && !isCurrent && !isDisabled;
  const canCompareWithCurrent =
    !isCurrent && !isDisabled && contextActions.canCompareWithCurrent(branch);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-7 w-full justify-start gap-1 rounded-md px-1.5 text-left text-xs transition-colors [&_svg]:size-3",
            isCurrent
              ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
              : selected
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
          onContextMenu={() => {
            if (!isDisabled) {
              onSelect(branch);
            }
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
          title={isCurrent ? undefined : t("repo.checkoutHint")}
        >
          <IndentGuides depth={depth} />
          <span className="size-3 shrink-0" aria-hidden="true" />
          {isCurrent ? (
            <Check className="shrink-0" aria-hidden="true" />
          ) : published ? (
            <GitBranchIcon className="text-muted-foreground shrink-0" aria-hidden="true" />
          ) : (
            <CloudOff className="text-muted-foreground shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {!published && !isRemote ? (
            <span className="text-muted-foreground shrink-0 text-[10px]">
              {t("repo.branchUnpublished")}
            </span>
          ) : null}
        </Button>
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-40">
        <ContextMenuItem
          disabled={!canCheckout}
          onSelect={() => contextActions.onCheckout(branch)}
        >
          <GitBranchIcon aria-hidden="true" />
          {t("repo.checkoutBranch")}
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          disabled={!canCompareWithCurrent}
          onSelect={() => contextActions.onCompareWithCurrent(branch)}
        >
          <GitCompareArrows className="size-3.5" aria-hidden="true" />
          {t("repo.compareCurrentWithBranch")}
        </ContextMenuItem>

        <ContextMenuItem
          disabled={!canPull}
          onSelect={() => contextActions.onPull(branch)}
        >
          <Download aria-hidden="true" />
          {t("repo.pull")}
        </ContextMenuItem>
        {canPublish ? (
          <ContextMenuItem onSelect={() => contextActions.onPublish(branch)}>
            <Upload aria-hidden="true" />
            {t("repo.publishBranch")}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            disabled={!canPush}
            onSelect={() => contextActions.onPush(branch)}
          >
            <Upload aria-hidden="true" />
            {t("repo.push")}
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem
          disabled={!canRename}
          onSelect={() => contextActions.onRename(branch)}
        >
          <Pencil aria-hidden="true" />
          {t("repo.renameBranch")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => contextActions.onCopyName(branch)}>
          <Copy aria-hidden="true" />
          {t("repo.copyBranchName")}
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          disabled={!canDelete}
          className="text-destructive focus:text-destructive"
          onSelect={() => contextActions.onDelete(branch)}
        >
          <Trash2 aria-hidden="true" />
          {t("repo.deleteBranch")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
