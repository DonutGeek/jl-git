export interface Project {
  id: string;
  workspaceId: string | null;
  name: string;
  /** 项目简介，可空 */
  description: string | null;
  /** Lucide 图标名；空则不展示 */
  icon: string;
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
  /** Lucide 图标名；空则不展示 */
  icon: string;
  /** #RRGGBB；空则不着色 */
  color: string;
  locked: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 分组树（上级选择 / TreeSelect） */
export interface WorkspaceTreeNode {
  id: string;
  name: string;
  icon: string;
  color: string;
  locked: boolean;
  children: WorkspaceTreeNode[];
}

export type CatalogTreeNodeKind = "workspace" | "project";

/** 仪表盘分组 + 仓库混排树 */
export interface CatalogTreeNode {
  key: string;
  kind: CatalogTreeNodeKind;
  id: string;
  parentId: string | null;
  name: string;
  icon: string;
  color: string;
  locked: boolean;
  path: string | null;
  selectable: boolean;
  isLeaf: boolean;
  children: CatalogTreeNode[];
}

/** 分组弹窗：有 id 为编辑，无 id 为新建 */
export interface WorkspaceGroupOpenPayload {
  id?: string;
  parentId?: string | null;
  name?: string;
  icon?: string;
  color?: string;
  locked?: boolean;
}

/** 「仓库已存在」弹窗 */
export interface ExistingProjectOpenPayload {
  project: Project;
  action?: "open" | "view";
}

export interface WorkspaceListResult {
  workspaces: Workspace[];
}
export interface WorkspaceTreeResult {
  tree: WorkspaceTreeNode[];
}
export interface ProjectCatalogTreeResult {
  tree: CatalogTreeNode[];
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
  icon?: string;
}
