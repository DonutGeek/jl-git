import { useState } from "react";
import { Download, FolderPlus, GitBranchPlus, RefreshCw, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CloneRepoPanel } from "@/components/project/CloneRepoPanel";
import { OpenRepoDialog } from "@/components/project/OpenRepoDialog";
import { ProjectCatalogExportDialog } from "@/components/project/ProjectCatalogExportDialog";
import { ProjectCatalogImportPreviewDialog } from "@/components/project/ProjectCatalogImportPreviewDialog";
import { SettingsTip } from "@/components/settings/SettingsTip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { projectCatalogService } from "@/services/project/project.catalog";
import { useProjectStore } from "@/store/useProjectStore";
import { toUserMessage } from "@/types/error";
import type { CatalogPreviewRow, ProjectCatalogDocument } from "@/types/projectCatalog";
import type { Project } from "@/types/project";
import { ProjectCatalogParseError } from "@/utils/projectCatalog";

interface ProjectManageToolbarProps {
  onOpenProject: (projectId: string) => void;
  onProjectsMutated?: () => void;
  onRefreshGit: () => void;
  /** 当前已应用筛选后的全量列表（非当前页） */
  filteredProjects: Project[];
  disabled?: boolean;
}

/** 管理台表格上头：左侧标题，右侧打开 / 克隆 / 导入 / 导出 / 刷新 */
export function ProjectManageToolbar({
  onOpenProject,
  onProjectsMutated,
  onRefreshGit,
  filteredProjects,
  disabled = false,
}: ProjectManageToolbarProps) {
  const { t } = useTranslation();
  const projects = useProjectStore((state) => state.projects);
  const workspaces = useProjectStore((state) => state.workspaces);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadWorkspaces = useProjectStore((state) => state.loadWorkspaces);

  const [openRepoOpen, setOpenRepoOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importDocument, setImportDocument] = useState<ProjectCatalogDocument | null>(null);
  const [importRows, setImportRows] = useState<CatalogPreviewRow[]>([]);
  const [importBusy, setImportBusy] = useState(false);

  async function handleImportClick(): Promise<void> {
    if (disabled || importBusy) {
      return;
    }
    setImportBusy(true);
    try {
      const document = await projectCatalogService.pickAndParseCatalog(
        t("projectManager.catalogFileFilter"),
      );
      if (!document) {
        return;
      }
      const rows = await projectCatalogService.buildImportPreview(document, workspaces);
      setImportDocument(document);
      setImportRows(rows);
      setImportPreviewOpen(true);
    } catch (error) {
      const message =
        error instanceof ProjectCatalogParseError ? error.message : toUserMessage(error);
      toast.error(message);
    } finally {
      setImportBusy(false);
    }
  }

  async function handleImported(): Promise<void> {
    try {
      await Promise.all([loadProjects(), loadWorkspaces()]);
      onProjectsMutated?.();
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="text-sm font-medium tracking-tight">
            {t("projectManager.manageListTitle")}
          </h2>
          <SettingsTip ariaLabel={t("projectManager.manageListTipAria")}>
            {t("projectManager.manageDescription")}
          </SettingsTip>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={disabled}
            onClick={() => setOpenRepoOpen(true)}
          >
            <FolderPlus className="size-3.5" aria-hidden="true" />
            {t("projectManager.open")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={disabled}
            onClick={() => setCloneOpen(true)}
          >
            <GitBranchPlus className="size-3.5" aria-hidden="true" />
            {t("projectManager.clone")}
          </Button>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={disabled || importBusy}
                aria-label={t("projectManager.catalogImport")}
                onClick={() => void handleImportClick()}
              >
                <Upload className="size-3.5" aria-hidden="true" />
                {t("projectManager.catalogImport")}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("projectManager.catalogImportHint")}</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={disabled}
                aria-label={t("projectManager.catalogExport")}
                onClick={() => setExportOpen(true)}
              >
                <Download className="size-3.5" aria-hidden="true" />
                {t("projectManager.catalogExport")}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("projectManager.catalogExportHint")}</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={disabled}
                aria-label={t("projectManager.manageRefreshGit")}
                onClick={onRefreshGit}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {t("projectManager.manageRefreshGit")}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("projectManager.manageRefreshGitHint")}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <OpenRepoDialog
        open={openRepoOpen}
        onOpenChange={setOpenRepoOpen}
        registerOnly
        onRegistered={() => {
          onProjectsMutated?.();
        }}
      />

      <Dialog
        open={cloneOpen}
        onOpenChange={(open) => {
          setCloneOpen(open);
          if (!open) {
            onProjectsMutated?.();
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-border shrink-0 border-b px-6 py-4">
            <DialogTitle>{t("projectManager.clone")}</DialogTitle>
            <DialogDescription>{t("projectManager.manageCloneDescription")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
            <CloneRepoPanel
              disabled={disabled}
              onOpenProject={(projectId) => {
                setCloneOpen(false);
                onProjectsMutated?.();
                onOpenProject(projectId);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <ProjectCatalogExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        allProjects={projects}
        allWorkspaces={workspaces}
        filteredProjects={filteredProjects}
      />

      <ProjectCatalogImportPreviewDialog
        open={importPreviewOpen}
        onOpenChange={(open) => {
          setImportPreviewOpen(open);
          if (!open) {
            setImportDocument(null);
            setImportRows([]);
          }
        }}
        document={importDocument}
        rows={importRows}
        onRowsChange={setImportRows}
        onImported={() => {
          void handleImported();
        }}
      />
    </>
  );
}
