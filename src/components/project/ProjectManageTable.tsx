import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Info, SquarePen, Trash2 } from "lucide-react";

import { SelectMenu } from "@/components/common/SelectMenu";
import { CopyablePathLabel } from "@/components/git/CopyablePathLabel";
import { ProjectContextMenu } from "@/components/project/ProjectContextMenu";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { RemoteRepositoryLabel } from "@/components/project/RemoteRepositoryLabel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { ProjectManageGitSnapshot } from "@/hooks/useProjectManageGitProbe";
import { openExternalUrl } from "@/services/system/open-url";
import type { Project } from "@/types/project";
import { buildManagePageItems } from "@/utils/projectManageFilter";
import { parseRemoteRepository } from "@/utils/remoteRepository";

const TABLE_COL_SPAN = 6;

interface ProjectManageTableProps {
  rows: readonly Project[];
  loading: boolean;
  snapshots: ReadonlyMap<string, ProjectManageGitSnapshot>;
  /** 分组 id → 显示名 */
  workspaceNameById: ReadonlyMap<string, string>;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpenDetail: (project: Project) => void;
  onOpenProject: (projectId: string) => void;
  onOpenSettings: (project: Project) => void;
  onDelete: (project: Project) => void;
  onProjectsMutated?: () => void;
}

/** 管理台表格 + 分页（列表展示常用字段；详情抽屉补全其余） */
export function ProjectManageTable({
  rows,
  loading,
  snapshots,
  workspaceNameById,
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  pageSizeOptions,
  disabled = false,
  onPageChange,
  onPageSizeChange,
  onOpenDetail,
  onOpenProject,
  onOpenSettings,
  onDelete,
  onProjectsMutated,
}: ProjectManageTableProps) {
  const { t } = useTranslation();
  const pageItems = buildManagePageItems(currentPage, totalPages);
  const pageSizeMenuOptions = pageSizeOptions.map((size) => ({
    value: String(size),
    label: t("projectManager.managePageSizeOption", { count: size }),
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="border-border min-h-0 flex-1 overflow-hidden rounded-md border">
        <ScrollArea className="h-full">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-36">{t("projectManager.manageColName")}</TableHead>
                <TableHead className="w-28">{t("projectManager.manageColGroup")}</TableHead>
                <TableHead className="min-w-40">{t("projectManager.manageColPath")}</TableHead>
                <TableHead className="min-w-36 max-w-48">
                  {t("projectManager.manageColBranch")}
                </TableHead>
                <TableHead className="min-w-36">{t("projectManager.manageColRemote")}</TableHead>
                <TableHead className="w-36 text-right">
                  {t("projectManager.manageColActions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={TABLE_COL_SPAN}
                    className="text-muted-foreground py-10 text-center text-xs"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="size-3.5" />
                      {t("common.loading")}
                    </span>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={TABLE_COL_SPAN}
                    className="text-muted-foreground py-10 text-center text-xs"
                  >
                    {t("projectManager.manageEmpty")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((project) => {
                  const snapshot = snapshots.get(project.id);
                  const groupLabel = project.workspaceId
                    ? (workspaceNameById.get(project.workspaceId) ?? t("projectManager.ungrouped"))
                    : t("projectManager.ungrouped");
                  const remote = snapshot?.remoteUrl
                    ? parseRemoteRepository(snapshot.remoteUrl)
                    : null;

                  return (
                    <TableRow key={project.id}>
                      <TableCell>
                        <ProjectContextMenu
                          project={project}
                          onOpenProject={onOpenProject}
                          disabled={disabled}
                          onRemoved={onProjectsMutated}
                        >
                          <button
                            type="button"
                            disabled={disabled}
                            className="hover:text-primary flex max-w-full min-w-0 cursor-pointer items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => onOpenProject(project.id)}
                          >
                            <ProjectIcon name={project.icon} className="size-4 shrink-0" />
                            <span className="truncate font-medium underline-offset-2 hover:underline">
                              {project.name}
                            </span>
                          </button>
                        </ProjectContextMenu>
                      </TableCell>
                      <TableCell className="max-w-36">
                        <Badge
                          variant="outline"
                          title={groupLabel}
                          className="max-w-full min-w-0 shrink justify-start font-normal"
                        >
                          <span className="min-w-0 truncate">{groupLabel}</span>
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-48"
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                      >
                        <CopyablePathLabel
                          path={project.path}
                          className="text-muted-foreground text-xs"
                        />
                      </TableCell>
                      <TableCell className="max-w-48">
                        <GitCell snapshot={snapshot} />
                      </TableCell>
                      <TableCell
                        className="max-w-48"
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                      >
                        {remote ? (
                          <RemoteRepositoryLabel
                            remote={remote}
                            className="ml-0 max-w-full min-w-0"
                            onOpen={(url) => {
                              void openExternalUrl(url);
                            }}
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="inline-flex items-center justify-end gap-0.5"
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                        >
                          <IconAction
                            label={t("projectManager.manageDetailAction")}
                            disabled={disabled}
                            onClick={() => onOpenDetail(project)}
                          >
                            <Info className="size-3.5" aria-hidden="true" />
                          </IconAction>
                          <IconAction
                            label={t("projectManager.manageEditAction")}
                            disabled={disabled}
                            onClick={() => onOpenSettings(project)}
                          >
                            <SquarePen className="size-3.5" aria-hidden="true" />
                          </IconAction>
                          <IconAction
                            label={t("projectManager.deleteProject")}
                            disabled={disabled}
                            destructive
                            onClick={() => onDelete(project)}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </IconAction>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs tabular-nums">
            {t("projectManager.managePageStatus", {
              page: currentPage,
              total: totalPages,
              count: totalCount,
            })}
          </p>
          <SelectMenu
            value={String(pageSize)}
            onChange={(value) => {
              const next = Number(value);
              if (Number.isFinite(next) && next > 0) {
                onPageSizeChange(next);
              }
            }}
            ariaLabel={t("projectManager.managePageSize")}
            disabled={disabled}
            size="sm"
            options={pageSizeMenuOptions}
            triggerClassName="h-8 w-[7.5rem]"
          />
        </div>
        <Pagination
          className="mx-0 w-auto justify-end"
          aria-label={t("projectManager.managePagination")}
        >
          <PaginationContent>
            <PaginationItem>
              {/*
               * 官方 PaginationPrevious（勿手搓 Link）。
               * ui 硬编码英文 Previous；表格场景隐藏文案改为图标+Tooltip（i18n，不改 ui/）。
               */}
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <PaginationPrevious
                    href="#"
                    aria-label={t("projectManager.managePrevPage")}
                    aria-disabled={currentPage <= 1 || disabled}
                    className={cn(
                      "size-9 p-0 [&>span]:hidden",
                      currentPage <= 1 && "pointer-events-none opacity-50",
                    )}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!disabled && currentPage > 1) {
                        onPageChange(currentPage - 1);
                      }
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>{t("projectManager.managePrevPage")}</TooltipContent>
              </Tooltip>
            </PaginationItem>
            {pageItems.map((item, index) =>
              item === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    href="#"
                    size="icon"
                    isActive={item === currentPage}
                    aria-label={t("projectManager.manageGoToPage", {
                      page: item,
                    })}
                    aria-disabled={disabled}
                    className={cn(disabled && "pointer-events-none opacity-50")}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!disabled) {
                        onPageChange(item);
                      }
                    }}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <PaginationNext
                    href="#"
                    aria-label={t("projectManager.manageNextPage")}
                    aria-disabled={currentPage >= totalPages || disabled}
                    className={cn(
                      "size-9 p-0 [&>span]:hidden",
                      currentPage >= totalPages && "pointer-events-none opacity-50",
                    )}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!disabled && currentPage < totalPages) {
                        onPageChange(currentPage + 1);
                      }
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>{t("projectManager.manageNextPage")}</TooltipContent>
              </Tooltip>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </footer>
    </div>
  );
}

function GitCell({ snapshot }: { snapshot?: ProjectManageGitSnapshot }) {
  const { t } = useTranslation();

  if (!snapshot || snapshot.status === "idle") {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  if (snapshot.status === "loading") {
    return <Spinner className="size-3" />;
  }
  if (snapshot.status === "error") {
    return (
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className="text-destructive text-xs">!</span>
        </TooltipTrigger>
        <TooltipContent>
          {snapshot.error ?? t("projectManager.manageGitProbeFailed")}
        </TooltipContent>
      </Tooltip>
    );
  }

  const label = snapshot.detached ? t("projectManager.manageDetached") : (snapshot.branch ?? "—");

  // Badge 默认 justify-center，长文案会被左右裁切；左对齐并由内层 truncate
  return (
    <Badge
      variant="secondary"
      title={label}
      className="max-w-full min-w-0 shrink justify-start font-normal"
    >
      <span className="min-w-0 truncate">{label}</span>
    </Badge>
  );
}

function IconAction({
  label,
  disabled,
  destructive,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-7", destructive && "text-destructive hover:text-destructive")}
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
