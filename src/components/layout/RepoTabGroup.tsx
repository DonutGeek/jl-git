import type { ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";

import {
  WORKSPACE_BORDER_CLASS,
  WORKSPACE_COLOR_CLASS,
  WORKSPACE_RING_CLASS,
  workspaceIconComponent,
} from "@/components/project/workspaceGroupAppearance";
import { cn } from "@/lib/utils";
import { repoTabGroupKey, type RepoTabWorkspaceId } from "@/utils/repoTabGroups";
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
}

interface RepoTabGroupChromeProps {
  workspace: Workspace;
  dragging?: boolean;
}

/** 分组名称条（拖组排序手柄 / DragOverlay） */
export function RepoTabGroupChrome({ workspace, dragging = false }: RepoTabGroupChromeProps) {
  const WorkspaceIcon = workspaceIconComponent(workspace.icon);
  return (
    <div
      className={cn(
        "text-muted-foreground flex max-w-28 shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] leading-none",
        WORKSPACE_BORDER_CLASS[workspace.color],
        dragging && "bg-background/90 shadow-sm",
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", WORKSPACE_COLOR_CLASS[workspace.color])}
        aria-hidden="true"
      />
      <WorkspaceIcon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{workspace.name}</span>
    </div>
  );
}

export function RepositoryTabGroup({
  workspaceId,
  workspace,
  tabIds,
  children,
  ungroupedLabel,
  isGroupDragging = false,
}: RepositoryTabGroupProps) {
  const droppableId = `repo-tab-group:${repoTabGroupKey(workspaceId)}`;
  const draggableId = `repo-tab-group-drag:${repoTabGroupKey(workspaceId)}`;
  const isNamedGroup = typeof workspaceId === "string" && Boolean(workspace);
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: droppableId,
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
    disabled: !isNamedGroup,
    data: {
      type: "group",
      workspaceId,
    } satisfies TabGroupDragData,
  });
  const WorkspaceIcon = workspace ? workspaceIconComponent(workspace.icon) : null;
  const borderClass = workspace ? WORKSPACE_BORDER_CLASS[workspace.color] : undefined;
  const ringClass = workspace ? WORKSPACE_RING_CLASS[workspace.color] : "ring-primary/40";

  return (
    <div
      ref={setDropRef}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1 rounded-lg",
        // 仅命名组显示分组壳；未分组 / 新标签页无壳
        isNamedGroup && "bg-background/45 border px-1 shadow-xs",
        isNamedGroup && borderClass,
        isOver && isNamedGroup && cn("ring-1", ringClass),
        (isDragging || isGroupDragging) && "opacity-60",
      )}
      data-repo-tab-group={repoTabGroupKey(workspaceId)}
      aria-label={workspaceId === null ? ungroupedLabel : undefined}
    >
      {isNamedGroup && workspace ? (
        <div
          ref={setDragRef}
          className="text-muted-foreground flex max-w-28 shrink-0 cursor-grab items-center gap-1 border-r border-border/60 pr-1.5 pl-1 text-[10px] leading-none active:cursor-grabbing"
          title={workspace.name}
          {...attributes}
          {...listeners}
        >
          <span
            className={cn("size-1.5 shrink-0 rounded-full", WORKSPACE_COLOR_CLASS[workspace.color])}
            aria-hidden="true"
          />
          {WorkspaceIcon ? <WorkspaceIcon className="size-3 shrink-0" aria-hidden="true" /> : null}
          <span className="truncate">{workspace.name}</span>
        </div>
      ) : null}
      <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
        <div className="flex items-center gap-1">{children}</div>
      </SortableContext>
    </div>
  );
}
