import { requestClient } from "@/utils/http";

import type { OkResult } from "@/types/git";
import type {
  AddProjectInput,
  CatalogTreeNode,
  PickDirectoryResult,
  Project,
  ProjectAddResult,
  ProjectCatalogTreeResult,
  ProjectListResult,
  ProjectOrderItem,
  ProjectResult,
  ProjectUniquenessResult,
  RecentItem,
  RecentListResult,
  Workspace,
  WorkspaceListResult,
  WorkspaceOrderItem,
  WorkspaceResult,
  WorkspaceTreeNode,
  WorkspaceTreeResult,
} from "@/types/project";

// 项目 / 分组本地接口；地址小驼峰，adapter 转到 Tauri Command。

/** 仓库画像里读出的单个文件（可能被截断） */
export interface ProjectProfileFile {
  name: string;
  content: string;
  truncated: boolean;
}

/** 仓库根目录画像：文件夹名、结构、抽样文件 */
export interface ProjectProfileSnapshot {
  folderName: string;
  structure: string[];
  files: ProjectProfileFile[];
}

/** 列出已登记仓库；传入 workspaceId 时只返回该分组下的 */
export async function listProjects(workspaceId?: string): Promise<Project[]> {
  const result = await requestClient.get<ProjectListResult>("projectList", {
    params: { workspaceId },
  });
  return result.projects;
}

/** 登记本地仓库；路径已存在时返回 alreadyExists，不覆盖名称/简介/图标/分组 */
export async function addProject(input: AddProjectInput): Promise<ProjectAddResult> {
  return requestClient.post<ProjectAddResult>("projectAdd", input);
}

/** 按本地路径或远端 URL 查是否已登记 */
export async function checkProjectUniqueness(input: {
  path?: string;
  remoteUrl?: string;
}): Promise<ProjectUniquenessResult> {
  return requestClient.get<ProjectUniquenessResult>("projectCheckUniqueness", {
    params: input,
  });
}

/** 记一次打开时间，供最近列表排序 */
export async function touchProjectOpened(id: string): Promise<void> {
  await requestClient.post<OkResult>("projectTouchOpened", { id });
}

/** 从应用目录移除仓库登记（不删磁盘上的 Git 仓库） */
export async function removeProject(id: string): Promise<void> {
  await requestClient.delete<OkResult>("projectRemove", { params: { id } });
}

/** 更新仓库别名、分组、简介、图标或路径 */
export async function updateProject(input: {
  id: string;
  name?: string;
  workspaceId?: string | null;
  description?: string | null;
  icon?: string;
  path?: string;
  allowRemoteMismatch?: boolean;
}): Promise<Project> {
  const result = await requestClient.put<ProjectResult>("projectUpdate", input);
  return result.project;
}

/** 系统选目录对话框；取消时返回 null */
export async function pickProjectDirectory(): Promise<string | null> {
  const result = await requestClient.get<PickDirectoryResult>("projectPickDirectory");
  return result.path;
}

/** 最近打开的仓库 */
export async function listRecentProjects(limit?: number): Promise<RecentItem[]> {
  const result = await requestClient.get<RecentListResult>("recentList", {
    params: { limit },
  });
  return result.items;
}

/** 从最近列表去掉一条，不删除仓库登记 */
export async function removeRecentProject(id: string): Promise<void> {
  await requestClient.delete<OkResult>("recentRemove", { params: { id } });
}

/** 列出全部分组（扁平） */
export async function listWorkspaces(): Promise<Workspace[]> {
  const result = await requestClient.get<WorkspaceListResult>("workspaceList");
  return result.workspaces;
}

/** 分组树，供上级 TreeSelect；excludeId 会排除该节点及子孙 */
export async function getWorkspaceTree(excludeId?: string): Promise<WorkspaceTreeNode[]> {
  const result = await requestClient.get<WorkspaceTreeResult>("workspaceTree", {
    params: { excludeId: excludeId || undefined },
  });
  return result.tree;
}

/** 仪表盘分组+仓库混排树；query 只过滤仓库名称/路径，分组仍保留 */
export async function getProjectCatalogTree(query?: string): Promise<CatalogTreeNode[]> {
  const result = await requestClient.get<ProjectCatalogTreeResult>("projectCatalogTree", {
    params: { query: query || undefined },
  });
  return result.tree;
}

/** 新建分组 */
export async function createWorkspace(
  name: string,
  parentId?: string,
  icon?: string,
  color?: string,
): Promise<Workspace> {
  const result = await requestClient.post<WorkspaceResult>("workspaceCreate", {
    name,
    parentId,
    icon: icon || "",
    color: color || "",
  });
  return result.workspace;
}

/** 更新分组名称、上级、图标、颜色或锁定 */
export async function updateWorkspace(input: {
  id: string;
  name?: string;
  parentId?: string | null;
  icon?: string;
  color?: string;
  locked?: boolean;
}): Promise<Workspace> {
  const result = await requestClient.put<WorkspaceResult>("workspaceUpdate", {
    id: input.id,
    name: input.name,
    parentId: input.parentId === undefined ? undefined : input.parentId,
    icon: input.icon,
    color: input.color === undefined ? undefined : input.color || "",
    locked: input.locked,
  });
  return result.workspace;
}

/** 删除分组；锁定的不能删。子分组升为根，其下仓库变为未分组 */
export async function removeWorkspace(id: string): Promise<void> {
  await requestClient.delete<OkResult>("workspaceDelete", { params: { id } });
}

/** 保存分组树拖拽后的顺序 */
export async function reorderWorkspaces(input: {
  workspaces: WorkspaceOrderItem[];
  projects: ProjectOrderItem[];
}): Promise<void> {
  await requestClient.put<OkResult>("workspaceReorder", input);
}

/** 读仓库根目录画像，供 AI 生成简介 */
export async function getProjectProfileSnapshot(path: string): Promise<ProjectProfileSnapshot> {
  return requestClient.get<ProjectProfileSnapshot>("projectProfileSnapshot", {
    params: { path },
  });
}
