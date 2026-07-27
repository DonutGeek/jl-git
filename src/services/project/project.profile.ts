import { invokeCommand } from "@/services/invoke";

export interface ProjectProfileFile {
  name: string;
  content: string;
  truncated: boolean;
}

export interface ProjectProfileSnapshot {
  folderName: string;
  files: ProjectProfileFile[];
}

/** 读取仓库根 README / 清单，供 AI 生成简介 */
export async function getProjectProfileSnapshot(path: string): Promise<ProjectProfileSnapshot> {
  return invokeCommand<ProjectProfileSnapshot>("project_profile_snapshot", {
    path,
  });
}
