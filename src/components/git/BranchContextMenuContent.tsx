import { useTranslation } from "react-i18next";
import {
  Copy,
  Download,
  GitCompareArrows,
  GitMerge,
  GitBranch as GitBranchIcon,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { GitBranch } from "@/types/git";

/** 分支行右键菜单动作（左栏树 / 工具栏下拉共用） */
export interface BranchContextActions {
  onCheckout: (branch: GitBranch) => void;
  onPull: (branch: GitBranch) => void;
  onPush: (branch: GitBranch) => void;
  onPublish: (branch: GitBranch) => void;
  onRename: (branch: GitBranch) => void;
  onCopyName: (branch: GitBranch) => void;
  onCompareWithCurrent: (branch: GitBranch) => void;
  canCompareWithCurrent: (branch: GitBranch) => boolean;
  onMergeIntoCurrent: (branch: GitBranch) => void;
  canMergeIntoCurrent: (branch: GitBranch) => boolean;
  onDelete: (branch: GitBranch) => void;
}

interface BranchContextMenuContentProps {
  branch: GitBranch;
  disabled: boolean;
  published: boolean;
  aheadCount: number;
  contextActions: BranchContextActions;
}

/**
 * 分支右键菜单内容。
 * 顺序：主操作 → 编辑 → 复制 → 同步 → 危险（ui-guidelines §2.3）。
 */
export function BranchContextMenuContent({
  branch,
  disabled,
  published,
  aheadCount,
  contextActions,
}: BranchContextMenuContentProps) {
  const { t } = useTranslation();
  const isCurrent = branch.isCurrent;
  const isRemote = branch.isRemote;
  const isDisabled = disabled;
  const canCheckout = !isCurrent && !isDisabled;
  const canPull = isCurrent && !isRemote && published && !isDisabled;
  const canPublish = isCurrent && !isRemote && !published && !isDisabled;
  const canPush = isCurrent && !isRemote && published && aheadCount > 0 && !isDisabled;
  const canRename = !isRemote && !isDisabled;
  const canDelete = !isRemote && !isCurrent && !isDisabled;
  const canCompareWithCurrent = !isDisabled && contextActions.canCompareWithCurrent(branch);
  const canMergeIntoCurrent =
    !isCurrent && !isDisabled && contextActions.canMergeIntoCurrent(branch);

  return (
    <ContextMenuContent
      className="min-w-40"
      // 嵌套在 Dropdown 内时避免关闭后焦点回跳打乱下拉
      onCloseAutoFocus={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ContextMenuItem disabled={!canCheckout} onSelect={() => contextActions.onCheckout(branch)}>
        <GitBranchIcon aria-hidden="true" />
        {t("repo.checkoutBranch")}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!canMergeIntoCurrent}
        onSelect={() => contextActions.onMergeIntoCurrent(branch)}
      >
        <GitMerge className="size-3.5" aria-hidden="true" />
        {t("repo.mergeIntoCurrent")}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!canCompareWithCurrent}
        onSelect={() => contextActions.onCompareWithCurrent(branch)}
      >
        <GitCompareArrows className="size-3.5" aria-hidden="true" />
        {t("repo.compareCurrentWithBranch")}
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem disabled={!canRename} onSelect={() => contextActions.onRename(branch)}>
        <Pencil aria-hidden="true" />
        {t("repo.renameBranch")}
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onSelect={() => contextActions.onCopyName(branch)}>
        <Copy aria-hidden="true" />
        {t("repo.copyBranchName")}
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem disabled={!canPull} onSelect={() => contextActions.onPull(branch)}>
        <Download aria-hidden="true" />
        {t("repo.pull")}
      </ContextMenuItem>
      {canPublish ? (
        <ContextMenuItem onSelect={() => contextActions.onPublish(branch)}>
          <Upload aria-hidden="true" />
          {t("repo.publishBranch")}
        </ContextMenuItem>
      ) : (
        <ContextMenuItem disabled={!canPush} onSelect={() => contextActions.onPush(branch)}>
          <Upload aria-hidden="true" />
          {t("repo.push")}
        </ContextMenuItem>
      )}

      <ContextMenuSeparator />

      <ContextMenuItem
        variant="destructive"
        disabled={!canDelete}
        onSelect={() => contextActions.onDelete(branch)}
      >
        <Trash2 aria-hidden="true" />
        {t("repo.deleteBranch")}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
