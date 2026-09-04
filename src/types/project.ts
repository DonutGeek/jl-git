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

/** Lucide kebab-case 图标名；边界处做运行时校验 */
export type ProjectIcon = string;
export const DEFAULT_PROJECT_ICON: ProjectIcon = "folder-git-2";

export interface Project {
  id: string;
  workspaceId: string | null;
  name: string;
  /** 项目简介，可空 */
  description: string | null;
  icon: ProjectIcon;
  path: string;
  /** 主远端 URL；无远端或尚未写入时为 null */
  remoteUrl: string | null;
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
  locked: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
/** Lucide kebab-case；历史值 folder/briefcase/code/layers/box 仍有效 */
export type WorkspaceIcon = string;
/** 规范化的大写 #RRGGBB 颜色 */
export type WorkspaceColor = `#${string}`;

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

export interface ProjectAddResult {
  project: Project;
  alreadyExists: boolean;
}

export type ProjectUniquenessKind = "new" | "existingPath" | "existingRemote";

export interface ProjectRemoteMatch {
  id: string;
  name: string;
  path: string;
}

export interface ProjectUniquenessResult {
  kind: ProjectUniquenessKind;
  project: Project | null;
  matches: ProjectRemoteMatch[];
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
