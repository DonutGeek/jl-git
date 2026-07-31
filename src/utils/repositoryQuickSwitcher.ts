import type { Project } from "@/types/project";
import { matchesContiguousQuery } from "@/utils/textHighlight";

/** 仓库快速切换按最近打开时间倒序；未打开过时回退更新时间。 */
export function sortProjectsForQuickSwitcher(projects: readonly Project[]): Project[] {
  return [...projects].sort((left, right) => {
    const leftTime = left.lastOpenedAt ?? left.updatedAt;
    const rightTime = right.lastOpenedAt ?? right.updatedAt;
    return rightTime.localeCompare(leftTime);
  });
}

/** Command 同时匹配仓库别名、所属分组与完整路径。 */
export function projectQuickSwitcherValue(project: Project, workspaceName?: string): string {
  return [project.name, workspaceName, project.path].filter(Boolean).join(" ");
}

/**
 * 与高亮一致：query 须作为连续子串出现在名 / 路径 / 分组名之一；
 * 无命中则返回空列表（不再用 cmdk 模糊匹配）。
 */
export function filterProjectsForQuickSwitcher(
  projects: readonly Project[],
  query: string,
  workspaceNameById: ReadonlyMap<string, string>,
): Project[] {
  const needle = query.trim();
  if (!needle) {
    return [...projects];
  }
  return projects.filter((project) => {
    const workspaceName = project.workspaceId
      ? (workspaceNameById.get(project.workspaceId) ?? "")
      : "";
    return (
      matchesContiguousQuery(project.name, needle) ||
      matchesContiguousQuery(project.path, needle) ||
      matchesContiguousQuery(workspaceName, needle)
    );
  });
}
