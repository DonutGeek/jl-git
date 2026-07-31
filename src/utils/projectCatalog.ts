import type { Project, Workspace } from "@/types/project";
import {
  PROJECT_CATALOG_SCHEMA,
  PROJECT_CATALOG_VERSION,
  type ProjectCatalogDocument,
  type ProjectCatalogProject,
  type ProjectCatalogWorkspace,
} from "@/types/projectCatalog";
import { isRecord } from "@/types/error";

export class ProjectCatalogParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectCatalogParseError";
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProjectCatalogParseError(`字段 ${field} 无效`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ProjectCatalogParseError("字符串字段类型错误");
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function requireBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value == null) {
    return fallback;
  }
  throw new ProjectCatalogParseError("布尔字段类型错误");
}

function requireNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value == null) {
    return fallback;
  }
  throw new ProjectCatalogParseError("数字字段类型错误");
}

function parseWorkspace(raw: unknown): ProjectCatalogWorkspace {
  if (!isRecord(raw)) {
    throw new ProjectCatalogParseError("分组条目无效");
  }
  return {
    id: requireString(raw.id, "workspaces.id"),
    parentId: optionalString(raw.parentId),
    name: requireString(raw.name, "workspaces.name"),
    icon: typeof raw.icon === "string" && raw.icon.trim() ? raw.icon.trim() : "folder",
    color: typeof raw.color === "string" && raw.color.trim() ? raw.color.trim() : "#5F75C1",
    locked: requireBoolean(raw.locked, false),
    sortOrder: requireNumber(raw.sortOrder, 0),
  };
}

function parseProject(raw: unknown): ProjectCatalogProject {
  if (!isRecord(raw)) {
    throw new ProjectCatalogParseError("项目条目无效");
  }
  const path = requireString(raw.path, "projects.path");
  if (!path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path) && !path.startsWith("\\\\")) {
    throw new ProjectCatalogParseError(`路径须为绝对路径：${path}`);
  }
  return {
    id: requireString(raw.id, "projects.id"),
    workspaceId: optionalString(raw.workspaceId),
    name: requireString(raw.name, "projects.name"),
    description: optionalString(raw.description),
    icon: typeof raw.icon === "string" && raw.icon.trim() ? raw.icon.trim() : "folder-git-2",
    path,
    pinned: requireBoolean(raw.pinned, false),
    sortOrder: requireNumber(raw.sortOrder, 0),
  };
}

/** 解析并校验清单 JSON */
export function parseCatalogJson(text: string): ProjectCatalogDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new ProjectCatalogParseError("JSON 无法解析");
  }
  if (!isRecord(parsed)) {
    throw new ProjectCatalogParseError("清单根对象无效");
  }
  if (parsed.schema !== PROJECT_CATALOG_SCHEMA) {
    throw new ProjectCatalogParseError("schema 不匹配");
  }
  if (parsed.version !== PROJECT_CATALOG_VERSION) {
    throw new ProjectCatalogParseError("version 不受支持");
  }
  if (!Array.isArray(parsed.workspaces) || !Array.isArray(parsed.projects)) {
    throw new ProjectCatalogParseError("workspaces / projects 须为数组");
  }
  const workspaces = parsed.workspaces.map(parseWorkspace);
  const projects = parsed.projects.map(parseProject);
  // 拓扑校验（环 / 缺父）
  topoSortWorkspaces(workspaces);
  return {
    schema: PROJECT_CATALOG_SCHEMA,
    version: PROJECT_CATALOG_VERSION,
    exportedAt:
      typeof parsed.exportedAt === "string" && parsed.exportedAt
        ? parsed.exportedAt
        : new Date().toISOString(),
    workspaces,
    projects,
  };
}

/** 父先于子；环或缺失父抛错 */
export function topoSortWorkspaces(
  workspaces: ProjectCatalogWorkspace[],
): ProjectCatalogWorkspace[] {
  const byId = new Map(workspaces.map((item) => [item.id, item] as const));
  for (const item of workspaces) {
    if (item.parentId && !byId.has(item.parentId)) {
      throw new ProjectCatalogParseError(`分组缺少父级：${item.name}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: ProjectCatalogWorkspace[] = [];

  function visit(id: string): void {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      throw new ProjectCatalogParseError("分组存在环");
    }
    visiting.add(id);
    const node = byId.get(id);
    if (!node) {
      throw new ProjectCatalogParseError("分组引用无效");
    }
    if (node.parentId) {
      visit(node.parentId);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(node);
  }

  for (const item of workspaces) {
    visit(item.id);
  }
  return ordered;
}

/** 收集项目用到的分组及其全部祖先 */
export function collectAncestorWorkspaces(
  projects: Project[],
  allWorkspaces: Workspace[],
): Workspace[] {
  const byId = new Map(allWorkspaces.map((item) => [item.id, item] as const));
  const needed = new Set<string>();

  for (const project of projects) {
    let cursor = project.workspaceId;
    while (cursor) {
      if (needed.has(cursor)) {
        break;
      }
      const workspace = byId.get(cursor);
      if (!workspace) {
        break;
      }
      needed.add(cursor);
      cursor = workspace.parentId;
    }
  }

  return allWorkspaces
    .filter((item) => needed.has(item.id))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
}

export function toCatalogWorkspace(workspace: Workspace): ProjectCatalogWorkspace {
  return {
    id: workspace.id,
    parentId: workspace.parentId,
    name: workspace.name,
    icon: workspace.icon,
    color: workspace.color,
    locked: workspace.locked,
    sortOrder: workspace.sortOrder,
  };
}

export function toCatalogProject(project: Project): ProjectCatalogProject {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    description: project.description,
    icon: project.icon,
    path: project.path,
    pinned: project.pinned,
    sortOrder: project.sortOrder,
  };
}

export function buildCatalogDocument(
  projects: Project[],
  workspaces: Workspace[],
  exportedAt: string = new Date().toISOString(),
): ProjectCatalogDocument {
  const sortedWorkspaces = workspaces
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
  const sortedProjects = projects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
  return {
    schema: PROJECT_CATALOG_SCHEMA,
    version: PROJECT_CATALOG_VERSION,
    exportedAt,
    workspaces: sortedWorkspaces.map(toCatalogWorkspace),
    projects: sortedProjects.map(toCatalogProject),
  };
}

/** 筛选导出：项目子集 + 祖先分组 */
export function clipCatalogForProjects(
  projects: Project[],
  allWorkspaces: Workspace[],
): { projects: Project[]; workspaces: Workspace[] } {
  return {
    projects,
    workspaces: collectAncestorWorkspaces(projects, allWorkspaces),
  };
}

/**
 * 名称优先消歧：同父同名 → 全局唯一同名 → id 兜底 → null（新建）
 * `mappedParentId` 为导出父级已映射到的本机 id。
 */
export function matchLocalWorkspace(
  catalog: ProjectCatalogWorkspace,
  localWorkspaces: Workspace[],
  mappedParentId: string | null,
): Workspace | null {
  const sibling = localWorkspaces.find(
    (item) => item.parentId === mappedParentId && item.name === catalog.name,
  );
  if (sibling) {
    return sibling;
  }

  const sameName = localWorkspaces.filter((item) => item.name === catalog.name);
  if (sameName.length === 1) {
    return sameName[0] ?? null;
  }

  const byId = localWorkspaces.find((item) => item.id === catalog.id);
  return byId ?? null;
}
