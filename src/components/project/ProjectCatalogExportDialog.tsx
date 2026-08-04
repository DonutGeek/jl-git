import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ButtonLoadingContent } from "@/components/common/ButtonLoadingContent";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { projectCatalogService } from "@/services/project/project.catalog";
import { toUserMessage } from "@/types/error";
import type { Project, Workspace } from "@/types/project";
import { clipCatalogForProjects } from "@/utils/projectCatalog";

interface ProjectCatalogExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allProjects: Project[];
  allWorkspaces: Workspace[];
  filteredProjects: Project[];
}

/** 导出仓库登记清单：可选全量或当前筛选 */
export function ProjectCatalogExportDialog({
  open,
  onOpenChange,
  allProjects,
  allWorkspaces,
  filteredProjects,
}: ProjectCatalogExportDialogProps) {
  const { t } = useTranslation();
  const [exportAll, setExportAll] = useState(true);
  const [exporting, setExporting] = useState(false);

  const summary = useMemo(() => {
    if (exportAll) {
      return { projectCount: allProjects.length, workspaceCount: allWorkspaces.length };
    }
    const clipped = clipCatalogForProjects(filteredProjects, allWorkspaces);
    return {
      projectCount: clipped.projects.length,
      workspaceCount: clipped.workspaces.length,
    };
  }, [allProjects.length, allWorkspaces, exportAll, filteredProjects]);

  async function handleExport(): Promise<void> {
    if (exporting) {
      return;
    }
    setExporting(true);
    try {
      const path = await projectCatalogService.exportCatalog({
        allProjects,
        allWorkspaces,
        exportAll,
        filteredProjects,
        filterName: t("projectManager.catalogFileFilter"),
      });
      if (!path) {
        return;
      }
      toast.success(t("projectManager.catalogExportSuccess"));
      onOpenChange(false);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!exporting) {
          onOpenChange(next);
          if (next) {
            setExportAll(true);
          }
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projectManager.catalogExportTitle")}</DialogTitle>
          <DialogDescription>{t("projectManager.catalogExportDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={exportAll}
              disabled={exporting}
              onCheckedChange={(checked) => setExportAll(checked === true)}
            />
            {t("projectManager.catalogExportAll")}
          </Label>
          <p className="text-muted-foreground text-sm">
            {t("projectManager.catalogExportSummary", {
              projects: summary.projectCount,
              workspaces: summary.workspaceCount,
            })}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={exporting}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={exporting || summary.projectCount === 0}
            onClick={() => void handleExport()}
          >
            <ButtonLoadingContent loading={exporting} loadingLabel={t("common.loading")}>
              {t("projectManager.catalogExportConfirm")}
            </ButtonLoadingContent>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
