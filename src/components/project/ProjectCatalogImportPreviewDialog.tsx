import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { TruncateStartPath } from "@/components/common/TruncateStartPath";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { projectCatalogService } from "@/services/project/project.catalog";
import { toUserMessage } from "@/types/error";
import type { CatalogPreviewRow, ProjectCatalogDocument } from "@/types/projectCatalog";

interface ProjectCatalogImportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: ProjectCatalogDocument | null;
  rows: CatalogPreviewRow[];
  onRowsChange: (rows: CatalogPreviewRow[]) => void;
  onImported: () => void;
}

/** 导入预览：勾选后执行新增 / 更新 */
export function ProjectCatalogImportPreviewDialog({
  open,
  onOpenChange,
  document,
  rows,
  onRowsChange,
  onImported,
}: ProjectCatalogImportPreviewDialogProps) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);

  const counts = useMemo(() => {
    let create = 0;
    let update = 0;
    for (const row of rows) {
      if (!row.selected || !row.selectable) {
        continue;
      }
      if (row.action === "create") {
        create += 1;
      } else if (row.action === "update") {
        update += 1;
      }
    }
    return { create, update };
  }, [rows]);

  const selectableRows = rows.filter((row) => row.selectable);

  function setAllSelectable(selected: boolean): void {
    onRowsChange(rows.map((row) => (row.selectable ? { ...row, selected } : row)));
  }

  function toggleRow(exportId: string, selected: boolean): void {
    onRowsChange(
      rows.map((row) => (row.exportId === exportId && row.selectable ? { ...row, selected } : row)),
    );
  }

  function actionLabel(action: CatalogPreviewRow["action"]): string {
    if (action === "create") {
      return t("projectManager.catalogActionCreate");
    }
    if (action === "update") {
      return t("projectManager.catalogActionUpdate");
    }
    return t("projectManager.catalogActionInvalid");
  }

  async function handleConfirm(): Promise<void> {
    if (!document || running) {
      return;
    }
    setRunning(true);
    try {
      const summary = await projectCatalogService.executeImport({ document, rows });
      toast.success(
        t("projectManager.catalogImportSummary", {
          created: summary.created,
          updated: summary.updated,
          skipped: summary.skipped,
          invalid: summary.invalid,
          failed: summary.failed,
        }),
      );
      if (summary.notes.length > 0) {
        console.info("[project.catalog] import notes", summary.notes);
      }
      onImported();
      onOpenChange(false);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!running) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-border shrink-0 border-b px-6 py-4">
          <DialogTitle>{t("projectManager.catalogImportTitle")}</DialogTitle>
          <DialogDescription>{t("projectManager.catalogImportDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 py-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={running || selectableRows.length === 0}
            onClick={() => setAllSelectable(true)}
          >
            {t("projectManager.catalogSelectAll")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={running || selectableRows.length === 0}
            onClick={() => setAllSelectable(false)}
          >
            {t("projectManager.catalogSelectNone")}
          </Button>
          <span className="text-muted-foreground text-xs">
            {t("projectManager.catalogImportCount", {
              create: counts.create,
              update: counts.update,
            })}
          </span>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>{t("projectManager.manageColName")}</TableHead>
                <TableHead>{t("projectManager.manageColPath")}</TableHead>
                <TableHead className="w-24">{t("projectManager.catalogColAction")}</TableHead>
                <TableHead>{t("projectManager.catalogColNote")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.exportId}>
                  <TableCell>
                    <Checkbox
                      checked={row.selected}
                      disabled={running || !row.selectable}
                      onCheckedChange={(checked) => toggleRow(row.exportId, checked === true)}
                      aria-label={row.name}
                    />
                  </TableCell>
                  <TableCell className="max-w-36 truncate font-medium" title={row.name}>
                    {row.name}
                  </TableCell>
                  <TableCell className="max-w-56">
                    <TruncateStartPath path={row.path} className="text-muted-foreground text-xs" />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={row.action === "invalid" ? "destructive" : "secondary"}
                      className="font-normal"
                    >
                      {actionLabel(row.action)}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground max-w-40 truncate text-xs"
                    title={row.note ?? undefined}
                  >
                    {row.note ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        <DialogFooter className="border-border shrink-0 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={running}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={running || (counts.create === 0 && counts.update === 0)}
            onClick={() => void handleConfirm()}
          >
            {running ? t("common.loading") : t("projectManager.catalogImportConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
