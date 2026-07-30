import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";

import {
  WORKSPACE_COLOR_CLASS,
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
}

export function RepositoryTabGroup({
  workspaceId,
  workspace,
  tabIds,
  children,
  ungroupedLabel,
}: RepositoryTabGroupProps) {
  const droppableId = `repo-tab-group:${repoTabGroupKey(workspaceId)}`;
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
    data: {
      type: "group",
      workspaceId,
    } satisfies TabGroupDragData,
  });
  const WorkspaceIcon = workspace ? workspaceIconComponent(workspace.icon) : null;
  const grouped = workspaceId !== undefined;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1 rounded-lg",
        grouped && "border-border/70 bg-background/45 border px-1 shadow-xs",
        isOver && "ring-primary/40 ring-1",
      )}
      data-repo-tab-group={repoTabGroupKey(workspaceId)}
    >
      {grouped ? (
        <div
          className="text-muted-foreground flex max-w-28 shrink-0 items-center gap-1 border-r pr-1.5 pl-1 text-[10px] leading-none"
          title={workspace?.name ?? ungroupedLabel}
        >
          {workspace ? (
            <>
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  WORKSPACE_COLOR_CLASS[workspace.color],
                )}
                aria-hidden="true"
              />
              {WorkspaceIcon ? (
                <WorkspaceIcon className="size-3 shrink-0" aria-hidden="true" />
              ) : null}
            </>
          ) : null}
          <span className="truncate">{workspace?.name ?? ungroupedLabel}</span>
        </div>
      ) : null}
      <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
        <div className="flex items-center gap-1">{children}</div>
      </SortableContext>
    </div>
  );
}
