import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";

import { AppAlertDialogContent } from "@/components/common/AppDialogContent";
import { ButtonLoadingContent } from "@/components/common/ButtonLoadingContent";
import { LucideIconPicker } from "@/components/common/LucideIconPicker";
import { lucideIconPickerI18n } from "@/components/project/lucideIconPickerI18n";
import { ProjectDescriptionField } from "@/components/project/ProjectDescriptionField";
import { WorkspaceSelectMenu } from "@/components/project/WorkspaceSelectMenu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { projectService } from "@/services/project";
import { useProjectStore } from "@/store/useProjectStore";

import { isAppError, toUserMessage } from "@/types/error";
import type { Project, ProjectIcon } from "@/types/project";

interface ProjectSettingsDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PendingSave {
  name: string;
  icon: ProjectIcon;
  workspaceId: string | null;
  description: string | null;
  path?: string;
}

/** 仓库编辑：右侧抽屉（与详情抽屉一致） */
export function ProjectSettingsDialog({ project, open, onOpenChange }: ProjectSettingsDialogProps) {
  const { t } = useTranslation();
  const updateProject = useProjectStore((state) => state.updateProject);
  const workspaces = useProjectStore((state) => state.workspaces);
  const [name, setName] = useState(project.name);
  const [path, setPath] = useState(project.path);
  const [icon, setIcon] = useState<ProjectIcon>(project.icon);
  const [workspaceId, setWorkspaceId] = useState(project.workspaceId ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [descriptionGenerating, setDescriptionGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [remoteMismatchOpen, setRemoteMismatchOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

  const sourceLocked = Boolean(
    project.workspaceId && workspaces.find((item) => item.id === project.workspaceId)?.locked,
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(project.name);
    setPath(project.path);
    setIcon(project.icon);
    setWorkspaceId(project.workspaceId ?? "");
    setDescription(project.description ?? "");
    setDescriptionGenerating(false);
    setRemoteMismatchOpen(false);
    setPendingSave(null);
  }, [open, project]);

  function handleOpenChange(nextOpen: boolean): void {
    if (!saving) {
      onOpenChange(nextOpen);
    }
  }

  async function handlePickDirectory(): Promise<void> {
    if (picking || saving || descriptionGenerating) {
      return;
    }
    const pickPromise = projectService.pickDirectory();
    setPicking(true);
    try {
      const selectedPath = await pickPromise;
      if (selectedPath) {
        setPath(selectedPath);
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setPicking(false);
    }
  }

  async function persist(input: PendingSave, allowRemoteMismatch: boolean): Promise<void> {
    setSaving(true);
    try {
      await updateProject({
        id: project.id,
        name: input.name,
        icon: input.icon,
        workspaceId: input.workspaceId,
        description: input.description,
        path: input.path,
        allowRemoteMismatch: allowRemoteMismatch || undefined,
      });
      toast.success(t("projectManager.projectSettingsSuccess"));
      setRemoteMismatchOpen(false);
      setPendingSave(null);
      onOpenChange(false);
    } catch (error) {
      if (
        !allowRemoteMismatch &&
        input.path &&
        isAppError(error) &&
        error.code === "REMOTE_MISMATCH"
      ) {
        setPendingSave(input);
        setRemoteMismatchOpen(true);
        return;
      }
      toast.error(toUserMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextName = name.trim();
    const nextPath = path.trim();
    if (!nextName || !nextPath || saving || descriptionGenerating) {
      return;
    }

    const nextWorkspaceId = workspaceId || null;
    if (nextWorkspaceId !== (project.workspaceId ?? null)) {
      if (sourceLocked) {
        toast.error(t("projectManager.lockedGroupMoveBlocked"));
        return;
      }
      if (nextWorkspaceId && workspaces.find((item) => item.id === nextWorkspaceId)?.locked) {
        toast.error(t("projectManager.lockedGroupMoveBlocked"));
        return;
      }
    }

    const pathChanged = nextPath !== project.path;
    await persist(
      {
        name: nextName,
        icon,
        workspaceId: nextWorkspaceId,
        description: description.trim() || null,
        path: pathChanged ? nextPath : undefined,
      },
      false,
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="flex w-[min(400px,92vw)] max-w-none flex-col gap-0 p-0 sm:max-w-100"
        >
          <SheetHeader className="border-border space-y-0 border-b px-4 py-3 pr-12 text-left">
            <SheetTitle className="text-sm font-semibold">
              {t("projectManager.manageEditAction")}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {t("projectManager.projectSettingsDescription")}
            </SheetDescription>
          </SheetHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <ScrollArea className="min-h-0 flex-1">
              <FieldGroup className="gap-4 p-4">
                <Field>
                  <FieldLabel htmlFor="project-settings-path">{t("openRepo.pathLabel")}</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="project-settings-path"
                      value={path}
                      onChange={(event) => setPath(event.target.value)}
                      placeholder={t("openRepo.pathPlaceholder")}
                      autoComplete="off"
                      disabled={saving || descriptionGenerating}
                    />
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-9 shrink-0"
                          aria-label={t("openRepo.pickButton")}
                          disabled={saving || picking || descriptionGenerating}
                          onClick={() => void handlePickDirectory()}
                        >
                          <FolderOpen className="size-4" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("openRepo.pickButton")}</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t("projectManager.projectPathEditHint")}
                  </p>
                </Field>

                <Field>
                  <FieldLabel htmlFor="project-settings-name">
                    {t("openRepo.aliasLabel")}
                  </FieldLabel>
                  <Input
                    id="project-settings-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={saving || descriptionGenerating}
                    autoComplete="off"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="project-settings-icon">
                      {t("projectManager.projectIcon")}
                    </FieldLabel>
                    <LucideIconPicker
                      id="project-settings-icon"
                      value={icon}
                      onValueChange={setIcon}
                      disabled={saving || descriptionGenerating}
                      {...lucideIconPickerI18n(t)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t("projectManager.workspaceLabel")}</FieldLabel>
                    <WorkspaceSelectMenu
                      value={workspaceId}
                      onChange={setWorkspaceId}
                      ariaLabel={t("projectManager.workspaceLabel")}
                      disabled={saving || descriptionGenerating || sourceLocked}
                      triggerClassName="h-9"
                    />
                  </Field>
                </div>

                <ProjectDescriptionField
                  value={description}
                  onChange={setDescription}
                  repoPath={path.trim() || project.path}
                  disabled={saving}
                  generating={descriptionGenerating}
                  onGeneratingChange={setDescriptionGenerating}
                  fieldId="project-settings-description"
                />
              </FieldGroup>
            </ScrollArea>

            <SheetFooter className="border-border flex-row justify-end gap-2 border-t px-4 py-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={saving}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || !path.trim() || saving || descriptionGenerating}
              >
                <ButtonLoadingContent loading={saving} loadingLabel={t("common.loading")}>
                  {t("projectManager.saveProjectSettings")}
                </ButtonLoadingContent>
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={remoteMismatchOpen}
        onOpenChange={(next) => {
          if (!saving) {
            setRemoteMismatchOpen(next);
            if (!next) {
              setPendingSave(null);
            }
          }
        }}
      >
        <AppAlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("projectManager.projectPathRemoteMismatchTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("projectManager.projectPathRemoteMismatchDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || !pendingSave}
              onClick={(event) => {
                event.preventDefault();
                if (pendingSave) {
                  void persist(pendingSave, true);
                }
              }}
            >
              <ButtonLoadingContent loading={saving} loadingLabel={t("common.loading")}>
                {t("projectManager.projectPathRemoteMismatchConfirm")}
              </ButtonLoadingContent>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </>
  );
}
