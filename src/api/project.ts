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

export interface ProjectProfileFile {
  name: string;
  content: string;
  truncated: boolean;
}

export interface ProjectProfileSnapshot {
  folderName: string;
  structure: string[];
  files: ProjectProfileFile[];
}

/** 本地后端地址（小驼峰）；Axios adapter 会转成 snake_case Command */
const Api = {
  projectList: "projectList",
  projectAdd: "projectAdd",
  projectCheckUniqueness: "projectCheckUniqueness",
  projectTouchOpened: "projectTouchOpened",
  projectRemove: "projectRemove",
  projectUpdate: "projectUpdate",
  projectPickDirectory: "projectPickDirectory",
  projectProfileSnapshot: "projectProfileSnapshot",
  recentList: "recentList",
  recentRemove: "recentRemove",
  workspaceList: "workspaceList",
  workspaceTree: "workspaceTree",
  projectCatalogTree: "projectCatalogTree",
  workspaceCreate: "workspaceCreate",
  workspaceUpdate: "workspaceUpdate",
  workspaceDelete: "workspaceDelete",
  workspaceReorder: "workspaceReorder",
} as const;

export function listProjects(workspaceId?: string): Promise<Project[]> {
  return requestClient
    .get<ProjectListResult>(Api.projectList, {
      params: { workspaceId },
    })
    .then((result) => result.projects);
}

export function addProject(input: AddProjectInput): Promise<ProjectAddResult> {
  return requestClient.post<ProjectAddResult>(Api.projectAdd, input);
}

export function checkProjectUniqueness(input: {
  path?: string;
  remoteUrl?: string;
}): Promise<ProjectUniquenessResult> {
  return requestClient.get<ProjectUniquenessResult>(Api.projectCheckUniqueness, {
    params: input,
  });
}

export function touchProjectOpened(id: string): Promise<void> {
  return requestClient.post<OkResult>(Api.projectTouchOpened, { id }).then(() => undefined);
}

export function removeProject(id: string): Promise<void> {
  return requestClient
    .delete<OkResult>(Api.projectRemove, { params: { id } })
    .then(() => undefined);
}

export function updateProject(input: {
  id: string;
  name?: string;
  workspaceId?: string | null;
  description?: string | null;
  icon?: string;
  path?: string;
  allowRemoteMismatch?: boolean;
}): Promise<Project> {
  return requestClient
    .put<ProjectResult>(Api.projectUpdate, input)
    .then((result) => result.project);
}

export function pickProjectDirectory(): Promise<string | null> {
  return requestClient
    .get<PickDirectoryResult>(Api.projectPickDirectory)
    .then((result) => result.path);
}

export function listRecentProjects(limit?: number): Promise<RecentItem[]> {
  return requestClient
    .get<RecentListResult>(Api.recentList, {
      params: { limit },
    })
    .then((result) => result.items);
}

export function removeRecentProject(id: string): Promise<void> {
  return requestClient.delete<OkResult>(Api.recentRemove, { params: { id } }).then(() => undefined);
}

export function listWorkspaces(): Promise<Workspace[]> {
  return requestClient
    .get<WorkspaceListResult>(Api.workspaceList)
    .then((result) => result.workspaces);
}

export function getWorkspaceTree(excludeId?: string): Promise<WorkspaceTreeNode[]> {
  return requestClient
    .get<WorkspaceTreeResult>(Api.workspaceTree, {
      params: { excludeId: excludeId || undefined },
    })
    .then((result) => result.tree);
}

export function getProjectCatalogTree(query?: string): Promise<CatalogTreeNode[]> {
  return requestClient
    .get<ProjectCatalogTreeResult>(Api.projectCatalogTree, {
      params: { query: query || undefined },
    })
    .then((result) => result.tree);
}

export function createWorkspace(
  name: string,
  parentId?: string,
  icon?: string,
  color?: string,
): Promise<Workspace> {
  return requestClient
    .post<WorkspaceResult>(Api.workspaceCreate, {
      name,
      parentId,
      icon: icon || "",
      color: color || "",
    })
    .then((result) => result.workspace);
}

export function updateWorkspace(input: {
  id: string;
  name?: string;
  parentId?: string | null;
  icon?: string;
  color?: string;
  locked?: boolean;
}): Promise<Workspace> {
  return requestClient
    .put<WorkspaceResult>(Api.workspaceUpdate, {
      id: input.id,
      name: input.name,
      parentId: input.parentId === undefined ? undefined : input.parentId,
      icon: input.icon,
      color: input.color === undefined ? undefined : input.color || "",
      locked: input.locked,
    })
    .then((result) => result.workspace);
}

export function removeWorkspace(id: string): Promise<void> {
  return requestClient
    .delete<OkResult>(Api.workspaceDelete, { params: { id } })
    .then(() => undefined);
}

export function reorderWorkspaces(input: {
  workspaces: WorkspaceOrderItem[];
  projects: ProjectOrderItem[];
}): Promise<void> {
  return requestClient.put<OkResult>(Api.workspaceReorder, input).then(() => undefined);
}

export function getProjectProfileSnapshot(path: string): Promise<ProjectProfileSnapshot> {
  return requestClient.get<ProjectProfileSnapshot>(Api.projectProfileSnapshot, {
    params: { path },
  });
}
