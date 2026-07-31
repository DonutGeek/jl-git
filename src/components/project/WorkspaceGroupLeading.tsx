import type { ReactNode } from "react";

import { LucideDynamicIcon } from "@/components/common/LucideDynamicIcon";
import type { TreeSelectNode } from "@/components/common/TreeSelect";
import { useAdaptedWorkspaceColor } from "@/hooks/useWorkspaceBadgeStyle";
import { cn } from "@/lib/utils";
import type { WorkspaceColor, WorkspaceIcon } from "@/types/project";
import type { WorkspaceTreeNode } from "@/utils/workspaceOptions";

interface WorkspaceColorDotProps {
  color: WorkspaceColor;
  className?: string;
}

/** 分组强调色圆点（展示色随昼夜自动适配） */
export function WorkspaceColorDot({ color, className }: WorkspaceColorDotProps) {
  const adapted = useAdaptedWorkspaceColor(color);
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: adapted }}
      aria-hidden="true"
    />
  );
}

interface WorkspaceGroupLeadingProps {
  icon?: WorkspaceIcon;
  color?: WorkspaceColor | null;
  /** 无颜色时仍显示图标（未分组 / 根分组） */
  className?: string;
  iconClassName?: string;
}

/** 分组选择行前缀：颜色点 + 图标 */
export function WorkspaceGroupLeading({
  icon,
  color,
  className,
  iconClassName,
}: WorkspaceGroupLeadingProps) {
  return (
    <span className={cn("flex shrink-0 items-center gap-1.5", className)}>
      {color ? <WorkspaceColorDot color={color} /> : null}
      <LucideDynamicIcon
        name={icon || "folder"}
        fallbackName="folder"
        className={cn("size-4 shrink-0", iconClassName)}
      />
    </span>
  );
}

interface WorkspaceGroupLabelProps {
  name: ReactNode;
  icon?: WorkspaceIcon;
  color?: WorkspaceColor | null;
  className?: string;
}

/** 触发器 / 选项用：颜色点 + 图标 + 名称 */
export function WorkspaceGroupLabel({ name, icon, color, className }: WorkspaceGroupLabelProps) {
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", className)}>
      <WorkspaceGroupLeading icon={icon} color={color} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </span>
  );
}

/** 将分组树转为 TreeSelect 节点（带颜色点 + 图标） */
export function mapWorkspaceTreeToSelectNodes(
  nodes: readonly WorkspaceTreeNode[],
): TreeSelectNode[] {
  return nodes.map((node) => ({
    value: node.value,
    label: node.label,
    disabled: node.disabled,
    leading: <WorkspaceGroupLeading icon={node.icon} color={node.color} />,
    children: node.children.length > 0 ? mapWorkspaceTreeToSelectNodes(node.children) : undefined,
  }));
}
