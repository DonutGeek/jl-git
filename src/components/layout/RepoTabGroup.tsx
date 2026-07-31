import type { ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { Lock } from "lucide-react";

import { LucideDynamicIcon } from "@/components/common/LucideDynamicIcon";
import { WorkspaceGroupContextMenu } from "@/components/project/WorkspaceGroupContextMenu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { repoTabGroupKey, type RepoTabWorkspaceId } from "@/utils/repoTabGroups";
import {
  normalizeWorkspaceColor,
  workspaceColorRing,
  workspaceColorTint,
} from "@/utils/workspaceColor";
import type { Workspace } from "@/types/project";

export interface TabGroupDragData {
  type: "group";
  workspaceId: RepoTabWorkspaceId;
}

interface RepositoryTabGroupProps {
  workspaceId: RepoTabWorkspaceId;
  workspace?: Workspace;
  tabIds: string[];
  children: ReactNode;
  ungroupedLabel: string;
  isGroupDragging?: boolean;
  onCloseGroup?: (workspaceId: string) => void;
}

interface RepoTabGroupChromeProps {
  workspace: Workspace;
  dragging?: boolean;
}

/** 分组名称条（拖组排序手柄 / DragOverlay） */
export function RepoTabGroupChrome({ workspace, dragging = false }: RepoTabGroupChromeProps) {
  const color = normalizeWorkspaceColor(workspace.color);
  return (
    <Badge
      variant="secondary"
      className={cn(
        "flex h-7 max-w-28 shrink-0 items-center gap-1 rounded-md border-transparent px-2.5 py-0 font-mono text-xs leading-none font-medium",
        dragging && "shadow-sm",
      )}
      style={{ backgroundColor: workspaceColorTint(color), color }}
    >
      <LucideDynamicIcon name={workspace.icon} fallbackName="folder" className="size-3 shrink-0" />
      <span className="truncate">{workspace.name}</span>
      {workspace.locked ? <Lock className="size-3 shrink-0 opacity-80" aria-hidden="true" /> : null}
    </Badge>
  );
}

export function RepositoryTabGroup({
  workspaceId,
  workspace,
  tabIds,
  children,
  ungroupedLabel,
  isGroupDragging = false,
  onCloseGroup,
}: RepositoryTabGroupProps) {
  const droppableId = `repo-tab-group:${repoTabGroupKey(workspaceId)}`;
  const draggableId = `repo-tab-group-drag:${repoTabGroupKey(workspaceId)}`;
  const isNamedGroup = typeof workspaceId === "string" && Boolean(workspace);
  const locked = Boolean(workspace?.locked);
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: droppableId,
    disabled: locked,
    data: {
      type: "group",
      workspaceId,
    } satisfies TabGroupDragData,
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: draggableId,
    disabled: !isNamedGroup || locked,
    data: {
      type: "group",
      workspaceId,
    } satisfies TabGroupDragData,
  });
  const groupColor = workspace ? normalizeWorkspaceColor(workspace.color) : null;

  const groupLabel =
    isNamedGroup && workspace && groupColor ? (
      <Badge
        variant="secondary"
        className="rounded-md border-transparent p-0"
        style={{ backgroundColor: workspaceColorTint(groupColor), color: groupColor }}
        asChild
      >
        <div
          ref={setDragRef}
          className={cn(
            "flex h-7 max-w-28 shrink-0 items-center gap-1 px-2.5 font-mono text-xs leading-none font-medium",
            locked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
          )}
          title={workspace.name}
          {...(locked ? {} : attributes)}
          {...(locked ? {} : listeners)}
        >
          <LucideDynamicIcon
            name={workspace.icon}
            fallbackName="folder"
            className="size-3 shrink-0"
          />
          <span className="truncate">{workspace.name}</span>
          {locked ? <Lock className="size-3 shrink-0 opacity-80" aria-hidden="true" /> : null}
        </div>
      </Badge>
    ) : null;

  return (
    <div
      ref={setDropRef}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-lg",
        // 仅命名组显示分组壳；未分组 / 新标签页无壳
        isNamedGroup && "bg-background/45 border px-1",
        (isDragging || isGroupDragging) && "opacity-60",
      )}
      style={
        groupColor
          ? {
              borderColor: groupColor,
              boxShadow:
                isOver && !locked ? `0 0 0 1px ${workspaceColorRing(groupColor)}` : undefined,
            }
          : undefined
      }
      data-repo-tab-group={repoTabGroupKey(workspaceId)}
      aria-label={workspaceId === null ? ungroupedLabel : undefined}
    >
      {groupLabel && workspace && onCloseGroup ? (
        <WorkspaceGroupContextMenu workspace={workspace} onCloseGroup={onCloseGroup}>
          {groupLabel}
        </WorkspaceGroupContextMenu>
      ) : (
        groupLabel
      )}
      <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
        <div className="flex items-center gap-1">{children}</div>
      </SortableContext>
    </div>
  );
}
