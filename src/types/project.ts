export const PROJECT_ICON_VALUES = [
  "folder-git-2",
  "folder",
  "code-2",
  "terminal",
  "braces",
  "box",
  "package",
  "layers-3",
  "database",
  "server",
  "globe-2",
  "cloud",
  "cpu",
  "app-window",
  "smartphone",
  "gamepad-2",
  "bot",
  "sparkles",
  "briefcase-business",
  "book-open",
] as const;

export type ProjectIcon = (typeof PROJECT_ICON_VALUES)[number];
export const DEFAULT_PROJECT_ICON: ProjectIcon = "folder-git-2";

export interface Project {
  id: string;
  workspaceId: string | null;
  name: string;
  /** 项目简介，可空 */
  description: string | null;
  icon: ProjectIcon;
  path: string;
  lastOpenedAt: string | null;
  pinned: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecentItem {
  projectId: string;
  openedAt: string;
}

export interface Workspace {
  id: string;
  parentId: string | null;
  name: string;
  icon: WorkspaceIcon;
  color: WorkspaceColor;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export type WorkspaceIcon = "folder" | "briefcase" | "code" | "layers" | "box";
export type WorkspaceColor = "blue" | "green" | "orange" | "purple" | "red";

export interface WorkspaceListResult {
  workspaces: Workspace[];
}
export interface WorkspaceResult {
  workspace: Workspace;
}
export interface WorkspaceOrderItem {
  id: string;
  sortOrder: number;
}
export interface ProjectOrderItem {
  id: string;
  workspaceId: string | null;
  sortOrder: number;
}

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
  description?: string;
  icon?: ProjectIcon;
}
