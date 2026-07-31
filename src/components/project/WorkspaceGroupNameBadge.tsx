import { LucideDynamicIcon } from "@/components/common/LucideDynamicIcon";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceBadgeStyle } from "@/hooks/useWorkspaceBadgeStyle";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/types/project";

interface WorkspaceGroupNameBadgeProps {
  workspace: Pick<Workspace, "name" | "icon" | "color">;
  className?: string;
  iconClassName?: string;
}

/** 分组名徽章：用户色自动适配昼夜 */
export function WorkspaceGroupNameBadge({
  workspace,
  className,
  iconClassName,
}: WorkspaceGroupNameBadgeProps) {
  const style = useWorkspaceBadgeStyle(workspace.color);
  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-4 max-w-28 shrink-0 gap-1 border-transparent px-1.5 text-[10px] font-medium",
        className,
      )}
      style={style}
      title={workspace.name}
    >
      <LucideDynamicIcon
        name={workspace.icon}
        fallbackName="folder"
        className={cn("!size-2.5 shrink-0 text-current", iconClassName)}
      />
      <span className="truncate">{workspace.name}</span>
    </Badge>
  );
}
