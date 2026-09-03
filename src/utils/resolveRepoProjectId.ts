import { useProjectStoreWithOut } from "@/store/modules/project";
import { useRepoStoreWithOut } from "@/store/modules/repo";

/** 主窗打开子窗时解析当前仓库对应的项目 ID */
export function resolveRepoProjectId(): string | null {
  const { current, projects } = useProjectStoreWithOut();
  if (current?.id) {
    return current.id;
  }
  const repoPath = useRepoStoreWithOut().repoPath;
  if (!repoPath) {
    return null;
  }
  return projects.find((item) => item.path === repoPath)?.id ?? null;
}
