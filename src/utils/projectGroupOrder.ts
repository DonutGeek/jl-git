import { ProjectOrderItem } from "@/types/project";

export interface ProjectGroupOrder {
  workspaceId: string | null;
  projectIds: readonly string[];
}

/** 根据分组视图中的项目顺序生成持久化排序项。 */
export function buildProjectOrderItems(groups: readonly ProjectGroupOrder[]): ProjectOrderItem[] {
  return groups.flatMap((group) =>
    group.projectIds.map((id, sortOrder) => ({
      id,
      workspaceId: group.workspaceId,
      sortOrder,
    })),
  );
}
