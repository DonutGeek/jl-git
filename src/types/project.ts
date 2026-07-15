export interface Project {
  id: string;
  workspaceId: string | null;
  name: string;
  path: string;
  lastOpenedAt: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecentItem {
  projectId: string;
  openedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceListResult { workspaces: Workspace[]; }
export interface WorkspaceResult { workspace: Workspace; }

export interface ProjectListResult {
  projects: Project[];
}

export interface ProjectResult {
  project: Project;
}

export interface PickDirectoryResult {
  path: string | null;
}

export interface RecentListResult {
  items: RecentItem[];
}

export interface AddProjectInput {
  path: string;
  name?: string;
  workspaceId?: string;
}
