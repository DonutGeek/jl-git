import { projectService } from "@/services/project/project.service";
import { workspaceService } from "@/services/project/workspace.service";
import { exportTextFile, importTextFile } from "@/services/system/system.write";
import { isAppError, toUserMessage } from "@/types/error";
import type { Project, Workspace } from "@/types/project";
import type {
  CatalogImportSummary,
  CatalogPreviewRow,
  ProjectCatalogDocument,
  ProjectCatalogWorkspace,
} from "@/types/projectCatalog";
import {
  buildCatalogDocument,
  clipCatalogForProjects,
  matchLocalWorkspace,
  parseCatalogJson,
  ProjectCatalogParseError,
  topoSortWorkspaces,
} from "@/utils/projectCatalog";
import { normalizeWorkspaceColor, requireWorkspaceColor } from "@/utils/workspaceColor";

function isInvalidPathError(error: unknown): boolean {
  if (!isAppError(error)) {
    return false;
  }
  return error.code === "INVALID_PATH" || error.code === "NOT_A_REPO";
}

function formatDateFileName(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `jlgit-projects-${y}-${m}-${d}.json`;
}

export function serializeCatalog(document: ProjectCatalogDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** 组装导出文档（全量或筛选子集） */
export function buildExportPayload(input: {
  allProjects: Project[];
  allWorkspaces: Workspace[];
  exportAll: boolean;
  filteredProjects: Project[];
}): ProjectCatalogDocument {
  if (input.exportAll) {
    return buildCatalogDocument(input.allProjects, input.allWorkspaces);
  }
  const clipped = clipCatalogForProjects(input.filteredProjects, input.allWorkspaces);
  return buildCatalogDocument(clipped.projects, clipped.workspaces);
}

/** 导出并弹出另存为；取消返回 null */
export async function exportCatalog(input: {
  allProjects: Project[];
  allWorkspaces: Workspace[];
  exportAll: boolean;
  filteredProjects: Project[];
  filterName: string;
}): Promise<string | null> {
  const document = buildExportPayload(input);
  return exportTextFile({
    contents: serializeCatalog(document),
    defaultPath: formatDateFileName(new Date()),
    filterName: input.filterName,
    extensions: ["json"],
  });
}

/** 选文件并解析；取消返回 null */
export async function pickAndParseCatalog(
  filterName: string,
): Promise<ProjectCatalogDocument | null> {
  const file = await importTextFile({
    filterName,
    extensions: ["json"],
  });
  if (!file) {
    return null;
  }
  try {
    return parseCatalogJson(file.contents);
  } catch (error) {
    if (error instanceof ProjectCatalogParseError) {
      throw error;
    }
    throw new ProjectCatalogParseError(toUserMessage(error));
  }
}

/**
 * 仅为预览解析分组映射（不写库）。
 * 返回 exportId → 预估 localId（已存在则用本机 id，否则仍用导出 id 作占位，执行时再建）。
 */
function previewWorkspaceIdMap(
  catalogWorkspaces: ProjectCatalogWorkspace[],
  localWorkspaces: Workspace[],
): Map<string, string | null> {
  const ordered = topoSortWorkspaces(catalogWorkspaces);
  const map = new Map<string, string | null>();

  for (const catalog of ordered) {
    const mappedParent =
      catalog.parentId == null ? null : (map.get(catalog.parentId) ?? catalog.parentId);
    const matched = matchLocalWorkspace(catalog, localWorkspaces, mappedParent);
    map.set(catalog.id, matched?.id ?? null);
  }
  return map;
}

/** 构建导入预览行（含路径探测） */
export async function buildImportPreview(
  document: ProjectCatalogDocument,
  localWorkspaces: Workspace[],
): Promise<CatalogPreviewRow[]> {
  const workspaceMap = previewWorkspaceIdMap(document.workspaces, localWorkspaces);
  const rows: CatalogPreviewRow[] = [];

  for (const catalog of document.projects) {
    const resolvedWorkspaceId =
      catalog.workspaceId == null
        ? null
        : (workspaceMap.get(catalog.workspaceId) ?? catalog.workspaceId);

    try {
      const uniqueness = await projectService.checkUniqueness({ path: catalog.path });
      if (uniqueness.kind === "existingPath" && uniqueness.project) {
        rows.push({
          exportId: catalog.id,
          name: catalog.name,
          path: catalog.path,
          action: "update",
          localProjectId: uniqueness.project.id,
          note: null,
          selectable: true,
          selected: true,
          resolvedWorkspaceId,
          catalog,
        });
        continue;
      }
      rows.push({
        exportId: catalog.id,
        name: catalog.name,
        path: catalog.path,
        action: "create",
        localProjectId: null,
        note: null,
        selectable: true,
        selected: true,
        resolvedWorkspaceId,
        catalog,
      });
    } catch (error) {
      if (isInvalidPathError(error)) {
        rows.push({
          exportId: catalog.id,
          name: catalog.name,
          path: catalog.path,
          action: "invalid",
          localProjectId: null,
          note: toUserMessage(error),
          selectable: false,
          selected: false,
          resolvedWorkspaceId,
          catalog,
        });
        continue;
      }
      throw error;
    }
  }

  return rows;
}

async function ensureWorkspacesMapped(
  catalogWorkspaces: ProjectCatalogWorkspace[],
  notes: string[],
): Promise<Map<string, string>> {
  const local = await workspaceService.list();
  const ordered = topoSortWorkspaces(catalogWorkspaces);
  const map = new Map<string, string>();
  let currentLocal = local;

  for (const catalog of ordered) {
    const mappedParent = catalog.parentId == null ? null : (map.get(catalog.parentId) ?? null);
    if (catalog.parentId && mappedParent == null) {
      throw new Error(`分组父级未映射：${catalog.name}`);
    }

    const matched = matchLocalWorkspace(catalog, currentLocal, mappedParent);
    if (matched) {
      map.set(catalog.id, matched.id);
      try {
        const color = requireWorkspaceColor(normalizeWorkspaceColor(catalog.color));
        await workspaceService.update({
          id: matched.id,
          icon: catalog.icon,
          color,
          locked: catalog.locked,
          parentId: mappedParent,
        });
      } catch (error) {
        notes.push(`${catalog.name}: ${toUserMessage(error)}`);
      }
      currentLocal = await workspaceService.list();
      continue;
    }

    const created = await workspaceService.create(
      catalog.name,
      mappedParent ?? undefined,
      catalog.icon,
      requireWorkspaceColor(normalizeWorkspaceColor(catalog.color)),
    );
    map.set(catalog.id, created.id);
    if (catalog.locked) {
      try {
        await workspaceService.update({ id: created.id, locked: true });
      } catch (error) {
        notes.push(`${catalog.name}: ${toUserMessage(error)}`);
      }
    }
    currentLocal = await workspaceService.list();
  }

  return map;
}

/** 执行导入：先分组映射，再按勾选处理项目 */
export async function executeImport(input: {
  document: ProjectCatalogDocument;
  rows: CatalogPreviewRow[];
}): Promise<CatalogImportSummary> {
  const summary: CatalogImportSummary = {
    created: 0,
    updated: 0,
    skipped: 0,
    invalid: 0,
    failed: 0,
    notes: [],
  };

  for (const row of input.rows) {
    if (row.action === "invalid") {
      summary.invalid += 1;
    }
  }

  const workspaceMap = await ensureWorkspacesMapped(input.document.workspaces, summary.notes);

  for (const row of input.rows) {
    if (row.action === "invalid") {
      continue;
    }
    if (!row.selected || !row.selectable) {
      summary.skipped += 1;
      continue;
    }

    const workspaceId =
      row.catalog.workspaceId == null ? null : (workspaceMap.get(row.catalog.workspaceId) ?? null);

    try {
      if (row.action === "create") {
        const result = await projectService.add({
          path: row.catalog.path,
          name: row.catalog.name,
          description: row.catalog.description ?? undefined,
          icon: row.catalog.icon,
          workspaceId: workspaceId ?? undefined,
        });
        if (result.alreadyExists) {
          summary.skipped += 1;
          summary.notes.push(`${row.catalog.name}: alreadyExists`);
        } else {
          summary.created += 1;
        }
        continue;
      }

      if (row.action === "update" && row.localProjectId) {
        await projectService.update({
          id: row.localProjectId,
          name: row.catalog.name,
          description: row.catalog.description,
          icon: row.catalog.icon,
          workspaceId,
        });
        summary.updated += 1;
      }
    } catch (error) {
      summary.failed += 1;
      summary.notes.push(`${row.catalog.name}: ${toUserMessage(error)}`);
      console.error("[project.catalog] import row failed", row.catalog.path, error);
    }
  }

  return summary;
}

export const projectCatalogService = {
  buildExportPayload,
  exportCatalog,
  pickAndParseCatalog,
  buildImportPreview,
  executeImport,
  serializeCatalog,
  parseCatalogJson,
};
