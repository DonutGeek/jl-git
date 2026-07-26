import type { ReactNode } from "react";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { FolderOpen, Settings2, Trash2 } from "lucide-react";

import { ProjectIcon } from "@/components/project/ProjectIcon";
import { RemoteRepositoryLabel } from "@/components/project/RemoteRepositoryLabel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { ProjectManageGitSnapshot } from "@/hooks/useProjectManageGitProbe";
import { openExternalUrl } from "@/services/system/open-url";
import type { Project } from "@/types/project";
import { parseRemoteRepository } from "@/utils/remoteRepository";

interface ProjectManageDetailDrawerProps {
  project: Project | null;
  groupLabel: string;
  snapshot?: ProjectManageGitSnapshot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProject: (projectId: string) => void;
  onOpenSettings: (project: Project) => void;
  onDelete: (project: Project) => void;
  disabled?: boolean;
}

function formatDateTime(value: string | null, neverLabel: string): string {
  if (!value) {
    return neverLabel;
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return neverLabel;
  }
  return parsed.format("YYYY-MM-DD HH:mm");
}

/** 仓库管理：右侧详情抽屉（属性信息 + 底栏主操作） */
export function ProjectManageDetailDrawer({
  project,
  groupLabel,
  snapshot,
  open,
  onOpenChange,
  onOpenProject,
  onOpenSettings,
  onDelete,
  disabled = false,
}: ProjectManageDetailDrawerProps) {
  const { t } = useTranslation();
  const remote = snapshot?.remoteUrl
    ? parseRemoteRepository(snapshot.remoteUrl)
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[min(400px,92vw)] max-w-none flex-col gap-0 p-0 sm:max-w-100"
      >
        <SheetHeader className="border-border space-y-0 border-b px-4 py-3 pr-12 text-left">
          <SheetTitle className="text-sm font-semibold">
            {t("projectManager.manageDetailTitle")}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("projectManager.manageDetailDescription")}
          </SheetDescription>
        </SheetHeader>

        {project ? (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-5 p-4">
                <div className="flex items-start gap-2.5">
                  <ProjectIcon
                    name={project.icon}
                    className="mt-0.5 size-5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">
                      {project.name}
                    </h3>
                    <p
                      className="text-muted-foreground mt-1 break-all font-mono text-xs"
                      title={project.path}
                    >
                      {project.path}
                    </p>
                  </div>
                </div>

                <DetailSection title={t("projectManager.manageDetailMeta")}>
                  <DetailRow
                    label={t("projectManager.manageColGroup")}
                    value={groupLabel}
                  />
                  <DetailRow
                    label={t("projectManager.manageColDescription")}
                    value={
                      project.description?.trim()
                        ? project.description
                        : t("projectManager.manageDetailEmptyValue")
                    }
                  />
                  <DetailRow
                    label={t("projectManager.manageColOpened")}
                    value={formatDateTime(
                      project.lastOpenedAt,
                      t("projectManager.manageNeverOpened"),
                    )}
                  />
                  <DetailRow
                    label={t("projectManager.manageDetailCreated")}
                    value={formatDateTime(
                      project.createdAt,
                      t("projectManager.manageDetailEmptyValue"),
                    )}
                  />
                  <DetailRow
                    label={t("projectManager.manageDetailUpdated")}
                    value={formatDateTime(
                      project.updatedAt,
                      t("projectManager.manageDetailEmptyValue"),
                    )}
                  />
                </DetailSection>

                <Separator />

                <DetailSection title={t("projectManager.manageDetailGit")}>
                  {snapshot?.status === "loading" ? (
                    <p className="text-muted-foreground text-xs">
                      {t("common.loading")}
                    </p>
                  ) : snapshot?.status === "error" ? (
                    <p
                      className="text-destructive text-xs"
                      title={snapshot.error}
                    >
                      {t("projectManager.manageGitProbeFailed")}
                    </p>
                  ) : snapshot?.status === "ready" ? (
                    <>
                      <DetailRow
                        label={t("projectManager.manageColBranch")}
                        value={
                          snapshot.detached
                            ? t("projectManager.manageDetached")
                            : (snapshot.branch ??
                              t("projectManager.manageDetailEmptyValue"))
                        }
                      />
                      <DetailRow
                        label={t("projectManager.manageColDirty")}
                        valueNode={
                          snapshot.dirtyCount > 0 ? (
                            <Badge
                              variant="outline"
                              className="font-normal tabular-nums"
                            >
                              {t("projectManager.manageDirtyCount", {
                                count: snapshot.dirtyCount,
                              })}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">
                              {t("projectManager.manageClean")}
                            </span>
                          )
                        }
                      />
                      <DetailRow
                        label={t("projectManager.manageColSync")}
                        value={
                          snapshot.ahead > 0 || snapshot.behind > 0
                            ? `↑${snapshot.ahead} ↓${snapshot.behind}`
                            : t("projectManager.manageDetailEmptyValue")
                        }
                      />
                      {snapshot.upstream ? (
                        <DetailRow
                          label={t("projectManager.manageColUpstream")}
                          value={snapshot.upstream}
                        />
                      ) : null}
                      <DetailRow
                        label={t("projectManager.manageColRemote")}
                        valueNode={
                          remote ? (
                            <RemoteRepositoryLabel
                              remote={remote}
                              className="ml-0 max-w-full min-w-0"
                              onOpen={(url) => {
                                void openExternalUrl(url);
                              }}
                            />
                          ) : (
                            <span className="text-muted-foreground">
                              {t("projectManager.manageDetailEmptyValue")}
                            </span>
                          )
                        }
                      />
                      <DetailRow
                        label={t("projectManager.manageColLastCommit")}
                        value={
                          snapshot.lastSubject
                            ? `${snapshot.lastSubject}${
                                snapshot.lastAuthoredAt
                                  ? ` · ${formatDateTime(snapshot.lastAuthoredAt, "")}`
                                  : ""
                              }`
                            : t("projectManager.manageDetailEmptyValue")
                        }
                      />
                    </>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      {t("projectManager.manageGitProbePending")}
                    </p>
                  )}
                </DetailSection>
              </div>
            </ScrollArea>

            <SheetFooter className="border-border mt-0 gap-2 border-t p-4">
              <Button
                type="button"
                size="sm"
                className="w-full"
                disabled={disabled}
                onClick={() => onOpenProject(project.id)}
              >
                <FolderOpen className="size-3.5" aria-hidden="true" />
                {t("projectManager.openProject")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={disabled}
                onClick={() => onOpenSettings(project)}
              >
                <Settings2 className="size-3.5" aria-hidden="true" />
                {t("projectManager.projectSettings")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive w-full"
                disabled={disabled}
                onClick={() => onDelete(project)}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {t("projectManager.deleteProject")}
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium">{title}</h4>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

function DetailRow({
  label,
  value,
  valueNode,
}: {
  label: string;
  value?: string;
  valueNode?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="min-w-0 text-xs wrap-break-word">
        {valueNode ?? value}
      </dd>
    </div>
  );
}
