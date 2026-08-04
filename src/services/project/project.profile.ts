import { invokeCommand } from "@/services/invoke";

export interface ProjectProfileFile {
  name: string;
  content: string;
  truncated: boolean;
}

export interface ProjectProfileSnapshot {
  folderName: string;
  /** 忽略依赖与构建产物后的受限目录结构。 */
  structure: string[];
  files: ProjectProfileFile[];
}

/** 读取项目入口、业务代码、依赖清单与目录结构，供 AI 生成项目详情。 */
export async function getProjectProfileSnapshot(path: string): Promise<ProjectProfileSnapshot> {
  return invokeCommand<ProjectProfileSnapshot>("project_profile_snapshot", {
    path,
  });
}
