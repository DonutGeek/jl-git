import type { Project, Workspace } from "@/types/project";

export const PROJECT_CATALOG_SCHEMA = "jlgit.project-catalog" as const;
export const PROJECT_CATALOG_VERSION = 1 as const;

export interface ProjectCatalogWorkspace {
  id: string;
  parentId: string | null;
  name: string;
  icon: string;
  color: string;
  locked: boolean;
  sortOrder: number;
}

export interface ProjectCatalogProject {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  icon: string;
  path: string;
  pinned: boolean;
  sortOrder: number;
}

export interface ProjectCatalogDocument {
  schema: typeof PROJECT_CATALOG_SCHEMA;
  version: typeof PROJECT_CATALOG_VERSION;
  exportedAt: string;
  workspaces: ProjectCatalogWorkspace[];
  projects: ProjectCatalogProject[];
}

export type CatalogPreviewAction = "create" | "update" | "invalid";

export interface CatalogPreviewRow {
  exportId: string;
  name: string;
  path: string;
  action: CatalogPreviewAction;
  /** 已存在时本机项目 id */
  localProjectId: string | null;
  note: string | null;
  /** invalid 时不可勾选 */
  selectable: boolean;
  selected: boolean;
  /** 映射后的目标分组 id；null = 无分组 */
  resolvedWorkspaceId: string | null;
  catalog: ProjectCatalogProject;
}

export interface CatalogImportSummary {
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
  failed: number;
  notes: string[];
}

export interface CatalogExportSource {
  projects: Project[];
  workspaces: Workspace[];
}
