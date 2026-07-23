import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SelectMenu } from "@/components/common/SelectMenu";
import { ProjectDescriptionField } from "@/components/project/ProjectDescriptionField";
import { ProjectIconPicker } from "@/components/project/ProjectIconPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";
import type { Project, ProjectIcon, Workspace } from "@/types/project";

interface ProjectSettingsDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function buildWorkspaceOptions(
  workspaces: Workspace[],
): Array<{ value: string; label: string }> {
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

  function labelFor(workspace: Workspace): string {
    const names = [workspace.name];
    const visited = new Set([workspace.id]);
    let parentId = workspace.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) {
        break;
      }
      names.unshift(parent.name);
      parentId = parent.parentId;
    }
    return names.join(" / ");
  }

  return workspaces
    .map((workspace) => ({ value: workspace.id, label: labelFor(workspace) }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function ProjectSettingsDialog({
  project,
  open,
  onOpenChange,
}: ProjectSettingsDialogProps) {
  const { t } = useTranslation();
  const workspaces = useProjectStore((state) => state.workspaces);
  const updateProject = useProjectStore((state) => state.updateProject);
  const [name, setName] = useState(project.name);
  const [icon, setIcon] = useState<ProjectIcon>(project.icon);
  const [workspaceId, setWorkspaceId] = useState(project.workspaceId ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [descriptionGenerating, setDescriptionGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const workspaceOptions = useMemo(
    () => [
      { value: "", label: t("projectManager.ungrouped") },
      ...buildWorkspaceOptions(workspaces),
    ],
    [t, workspaces],
  );

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("projectManager.projectSettings")}</DialogTitle>
          <DialogDescription>
            {t("projectManager.projectSettingsDescription")}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="project-settings-path">
                {t("openRepo.pathLabel")}
              </FieldLabel>
              <Input id="project-settings-path" value={project.path} readOnly />
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
                <ProjectIconPicker
                  id="project-settings-icon"
                  value={icon}
                  onValueChange={setIcon}
                  disabled={saving || descriptionGenerating}
                />
              </Field>
              <Field>
                <FieldLabel>{t("projectManager.workspaceLabel")}</FieldLabel>
                <SelectMenu
                  value={workspaceId}
                  options={workspaceOptions}
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

          <DialogFooter>
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
              disabled={!name.trim() || saving || descriptionGenerating}
            >
              {saving ? t("common.loading") : t("projectManager.saveProjectSettings")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
