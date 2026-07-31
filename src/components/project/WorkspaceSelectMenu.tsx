import { useMemo, useState, type ReactNode } from "react";
import { Folder, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TreeSelect } from "@/components/common/TreeSelect";
import {
  mapWorkspaceTreeToSelectNodes,
  WorkspaceGroupLabel,
} from "@/components/project/WorkspaceGroupLeading";
import { WorkspaceGroupDialog } from "@/components/project/WorkspaceGroupDialog";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/useProjectStore";
import { buildWorkspaceTree, findWorkspaceTreeNode } from "@/utils/workspaceOptions";

interface WorkspaceSelectMenuProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  triggerClassName?: string;
  /** 空选项文案；默认「未分组」 */
  emptyLabel?: string;
  /** 是否展示空选项；默认 true */
  includeEmpty?: boolean;
  /** 编辑上级时排除自身及子孙，避免成环 */
  excludeIds?: ReadonlySet<string>;
  /** @deprecated 分组选择始终展示组图标与颜色点 */
  showFolderIcon?: boolean;
  /** 自定义触发器展示 */
  displayLabel?: ReactNode;
  /** 是否展示底部「添加分组」 */
  allowQuickAdd?: boolean;
}

/** 仓库分组树形选择：可展开层级，底部可快捷添加分组 */
export function WorkspaceSelectMenu({
  value,
  onChange,
  ariaLabel,
  disabled = false,
  triggerClassName,
  emptyLabel,
  includeEmpty = true,
  excludeIds,
  displayLabel,
  allowQuickAdd = true,
}: WorkspaceSelectMenuProps) {
  const { t } = useTranslation();
  const workspaces = useProjectStore((state) => state.workspaces);

  const [createOpen, setCreateOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);

  const resolvedEmptyLabel = emptyLabel ?? t("projectManager.ungrouped");
  const emptyLeading = <Folder className="size-4 shrink-0" aria-hidden="true" />;

  const workspaceTree = useMemo(
    () =>
      buildWorkspaceTree(workspaces, excludeIds ?? new Set(), {
        disableLocked: true,
        allowLockedValue: value || undefined,
      }),
    [workspaces, excludeIds, value],
  );

  const tree = useMemo(() => mapWorkspaceTreeToSelectNodes(workspaceTree), [workspaceTree]);

  const selectedNode = useMemo(
    () => (value ? findWorkspaceTreeNode(workspaceTree, value) : null),
    [value, workspaceTree],
  );

  const currentLabel = selectedNode?.label ?? (value ? value : resolvedEmptyLabel);

  function openCreateDialog(): void {
    setTreeOpen(false);
    window.requestAnimationFrame(() => {
      setCreateOpen(true);
    });
  }

  return (
    <>
      <TreeSelect
        value={value}
        onChange={onChange}
        nodes={tree}
        ariaLabel={ariaLabel}
        disabled={disabled}
        triggerClassName={triggerClassName}
        open={treeOpen}
        onOpenChange={setTreeOpen}
        displayLabel={
          displayLabel ??
          (value && selectedNode ? (
            <WorkspaceGroupLabel
              name={selectedNode.label}
              icon={selectedNode.icon}
              color={selectedNode.color}
            />
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
              {emptyLeading}
              <span className="min-w-0 flex-1 truncate">{currentLabel}</span>
            </span>
          ))
        }
        emptyOption={
          includeEmpty
            ? {
                value: "",
                label: resolvedEmptyLabel,
                icon: emptyLeading,
              }
            : undefined
        }
        footer={
          allowQuickAdd ? (
            <Button
              type="button"
              variant="ghost"
              className="text-primary h-8 w-full justify-start gap-2 px-2 font-normal"
              onClick={openCreateDialog}
            >
              <Plus className="size-4 shrink-0" aria-hidden="true" />
              {t("projectManager.quickAddGroup")}
            </Button>
          ) : undefined
        }
      />

      {allowQuickAdd ? (
        <WorkspaceGroupDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode="create"
          onCreated={(workspace) => onChange(workspace.id)}
        />
      ) : null}
    </>
  );
}
