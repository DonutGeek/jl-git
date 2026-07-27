import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ProjectDescriptionField } from "@/components/project/ProjectDescriptionField";
import { ProjectIconPicker } from "@/components/project/ProjectIconPicker";
import { WorkspaceSelectMenu } from "@/components/project/WorkspaceSelectMenu";
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

import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";
import type { Project, ProjectIcon } from "@/types/project";

interface ProjectSettingsDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 仓库编辑：右侧抽屉（与详情抽屉一致） */
export function ProjectSettingsDialog({ project, open, onOpenChange }: ProjectSettingsDialogProps) {
  const { t } = useTranslation();
  const updateProject = useProjectStore((state) => state.updateProject);
  const [name, setName] = useState(project.name);
  const [icon, setIcon] = useState<ProjectIcon>(project.icon);
  const [workspaceId, setWorkspaceId] = useState(project.workspaceId ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [descriptionGenerating, setDescriptionGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(project.name);
    setIcon(project.icon);
    setWorkspaceId(project.workspaceId ?? "");
    setDescription(project.description ?? "");
    setDescriptionGenerating(false);
  }, [open, project]);

  function handleOpenChange(nextOpen: boolean): void {
    if (!saving) {
      onOpenChange(nextOpen);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || saving || descriptionGenerating) {
      return;
    }

    setSaving(true);
    try {
      await updateProject({
        id: project.id,
        name: nextName,
        icon,
        workspaceId: workspaceId || null,
        description: description.trim() || null,
      });
      toast.success(t("projectManager.projectSettingsSuccess"));
      onOpenChange(false);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
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
                <Input id="project-settings-path" value={project.path} readOnly />
              </Field>

              <Field>
                <FieldLabel htmlFor="project-settings-name">{t("openRepo.aliasLabel")}</FieldLabel>
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
                  <ProjectIconPicker
                    id="project-settings-icon"
                    value={icon}
                    onValueChange={setIcon}
                    disabled={saving || descriptionGenerating}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("projectManager.workspaceLabel")}</FieldLabel>
                  <WorkspaceSelectMenu
                    value={workspaceId}
                    onChange={setWorkspaceId}
                    ariaLabel={t("projectManager.workspaceLabel")}
                    disabled={saving || descriptionGenerating}
                    triggerClassName="h-9"
                  />
                </Field>
              </div>

              <ProjectDescriptionField
                value={description}
                onChange={setDescription}
                repoPath={project.path}
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
            <Button type="submit" disabled={!name.trim() || saving || descriptionGenerating}>
              {saving ? t("common.loading") : t("projectManager.saveProjectSettings")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
