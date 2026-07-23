import type { Project } from "@/types/project";

/** 仓库快速切换按最近打开时间倒序；未打开过时回退更新时间。 */
export function sortProjectsForQuickSwitcher(
  projects: readonly Project[],
): Project[] {
  return [...projects].sort((left, right) => {
    const leftTime = left.lastOpenedAt ?? left.updatedAt;
    const rightTime = right.lastOpenedAt ?? right.updatedAt;
    return rightTime.localeCompare(leftTime);
  });
}

/** Command 同时匹配仓库别名、所属分组与完整路径。 */
export function projectQuickSwitcherValue(
  project: Project,
  workspaceName?: string,
): string {
  return [project.name, workspaceName, project.path].filter(Boolean).join(" ");
}
