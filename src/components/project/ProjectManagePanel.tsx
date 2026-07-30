import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ProjectManageDetailDrawer } from "@/components/project/ProjectManageDetailDrawer";
import { ProjectManageFilterForm } from "@/components/project/ProjectManageFilterForm";
import { ProjectManageTable } from "@/components/project/ProjectManageTable";
import { ProjectManageToolbar } from "@/components/project/ProjectManageToolbar";
import { ProjectSettingsDialog } from "@/components/project/ProjectSettingsDialog";
import { AppAlertDialogContent } from "@/components/common/AppDialogContent";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useProjectManageGitProbe } from "@/hooks/useProjectManageGitProbe";
import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";
import {
  EMPTY_MANAGE_FILTERS,
  MANAGE_DIRTY_ALL,
  MANAGE_SYNC_ALL,
  filterAndSortProjects,
  type ManageFilters,
} from "@/utils/projectManageFilter";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 50] as const;

interface ProjectManagePanelProps {
  onOpenProject: (projectId: string) => void;
  /** 删除 / 设置变更后回调（子窗用于通知主窗刷新） */
  onProjectsMutated?: () => void;
  disabled?: boolean;
}

/** 项目管理控制台：筛选 / 工具条 / 表格 */
export function ProjectManagePanel({
  onOpenProject,
  onProjectsMutated,
  disabled = false,
}: ProjectManagePanelProps) {
  const { t } = useTranslation();
  const projects = useProjectStore((state) => state.projects);
  const workspaces = useProjectStore((state) => state.workspaces);
  const loading = useProjectStore((state) => state.loading);
  const removeProject = useProjectStore((state) => state.removeProject);

  const [draftFilters, setDraftFilters] = useState<ManageFilters>(EMPTY_MANAGE_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ManageFilters>(EMPTY_MANAGE_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [gitRefreshToken, setGitRefreshToken] = useState(0);

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const workspace of workspaces) {
      map.set(workspace.id, workspace.name);
    }
    return map;
  }, [workspaces]);

  const needsWideProbe =
    appliedFilters.dirty !== MANAGE_DIRTY_ALL || appliedFilters.sync !== MANAGE_SYNC_ALL;

  // 先按关键词/分组/排序得到基表，再决定探测范围
  const baseFiltered = useMemo(
    () =>
      filterAndSortProjects(
        projects,
        {
          ...appliedFilters,
          dirty: MANAGE_DIRTY_ALL,
          sync: MANAGE_SYNC_ALL,
        },
        new Map(),
      ),
    [appliedFilters, projects],
  );

  const pageForProbe = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(baseFiltered.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    return baseFiltered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [baseFiltered, page, pageSize]);

  const probeTargets = needsWideProbe ? baseFiltered : pageForProbe;
  const { snapshots, lites } = useProjectManageGitProbe(probeTargets, gitRefreshToken);

  const filtered = useMemo(
    () => filterAndSortProjects(projects, appliedFilters, lites),
    [appliedFilters, lites, projects],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function updateDraft<K extends keyof ManageFilters>(key: K, value: ManageFilters[K]): void {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  }

  function applyFilters(next: ManageFilters): void {
    setAppliedFilters(next);
    setDraftFilters(next);
    setPage(1);
  }

  function handleResetFilters(): void {
    applyFilters(EMPTY_MANAGE_FILTERS);
  }

  function handleOpen(projectId: string): void {
    if (disabled) {
      return;
    }
    onOpenProject(projectId);
  }

  async function handleDelete(): Promise<void> {
    if (!deleteProject || deleting) {
      return;
    }
    setDeleting(true);
    try {
      await removeProject(deleteProject.id);
      toast.success(t("projectManager.deleteProjectSuccess", { name: deleteProject.name }));
      setDeleteProject(null);
      if (detailProject?.id === deleteProject.id) {
        setDetailProject(null);
      }
      onProjectsMutated?.();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  const detailGroupLabel = detailProject
    ? detailProject.workspaceId
      ? (workspaceNameById.get(detailProject.workspaceId) ?? t("projectManager.ungrouped"))
      : t("projectManager.ungrouped")
    : t("projectManager.ungrouped");

  // 列表里的项目可能已更新；抽屉始终跟 store 中最新实体
  const detailProjectLive = detailProject
    ? (projects.find((item) => item.id === detailProject.id) ?? detailProject)
    : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <ProjectManageFilterForm
        draft={draftFilters}
        onDraftChange={updateDraft}
        onSubmit={() => applyFilters(draftFilters)}
        onReset={handleResetFilters}
        disabled={disabled || loading}
      />
      <ProjectManageToolbar
        onOpenProject={handleOpen}
        onProjectsMutated={onProjectsMutated}
        onRefreshGit={() => setGitRefreshToken((token) => token + 1)}
        disabled={disabled || loading}
      />
      <ProjectManageTable
        rows={pageRows}
        loading={loading}
        snapshots={snapshots}
        workspaceNameById={workspaceNameById}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={filtered.length}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        disabled={disabled}
        onPageChange={(nextPage) => {
          if (nextPage >= 1 && nextPage <= totalPages) {
            setPage(nextPage);
          }
        }}
        onPageSizeChange={(nextSize) => {
          setPageSize(nextSize);
          setPage(1);
        }}
        onOpenDetail={(project) => {
          setSettingsProject(null);
          setDetailProject(project);
        }}
        onOpenProject={handleOpen}
        onOpenSettings={(project) => {
          setDetailProject(null);
          setSettingsProject(project);
        }}
        onDelete={setDeleteProject}
        onProjectsMutated={onProjectsMutated}
      />

      <ProjectManageDetailDrawer
        project={detailProjectLive}
        groupLabel={detailGroupLabel}
        snapshot={detailProjectLive ? snapshots.get(detailProjectLive.id) : undefined}
        open={Boolean(detailProject)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDetailProject(null);
          }
        }}
      />

      {settingsProject ? (
        <ProjectSettingsDialog
          project={settingsProject}
          open
          onOpenChange={(open) => {
            if (!open) {
              setSettingsProject(null);
              onProjectsMutated?.();
            }
          }}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deleteProject)}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteProject(null);
          }
        }}
      >
        <AppAlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projectManager.deleteProjectTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("projectManager.deleteProjectQuestion", {
                name: deleteProject?.name ?? "",
              })}
              <span className="mt-2 block">{t("projectManager.deleteProjectHint")}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? t("common.loading") : t("projectManager.deleteProject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </div>
  );
}
