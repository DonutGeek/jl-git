import type { FormEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { LucideIconPicker } from "@/components/common/LucideIconPicker";
import { ButtonLoadingContent } from "@/components/common/ButtonLoadingContent";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import { lucideIconPickerI18n } from "@/components/project/lucideIconPickerI18n";
import { ProjectDescriptionField } from "@/components/project/ProjectDescriptionField";
import { ExistingProjectDialog } from "@/components/project/ProjectUniquenessDialogs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { projectService } from "@/services/project";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";
import { DEFAULT_PROJECT_ICON, type Project, type ProjectIcon } from "@/types/project";

interface OpenRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replaceNewTabId?: string;
  /**
   * 仅登记到应用（不切主窗标签、不导航）。
   * 供仓库管理子窗使用。
   */
  registerOnly?: boolean;
  onRegistered?: (projectId: string) => void;
}

/** 打开本地仓库对话框：路径可输入/选择，别名与项目详情可选 */
export function OpenRepoDialog({
  open,
  onOpenChange,
  replaceNewTabId,
  registerOnly = false,
  onRegistered,
}: OpenRepoDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const addAndOpen = useProjectStore((state) => state.addAndOpen);
  const addProject = useProjectStore((state) => state.addProject);
  const openExisting = useProjectStore((state) => state.openExisting);
  const openRepositoryTab = useOpenTabsStore((state) => state.openRepositoryTab);
  const replaceNewTabWithRepository = useOpenTabsStore(
    (state) => state.replaceNewTabWithRepository,
  );

  const [path, setPath] = useState("");
  const [alias, setAlias] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionGenerating, setDescriptionGenerating] = useState(false);
  const [icon, setIcon] = useState<ProjectIcon>(DEFAULT_PROJECT_ICON);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [existingProject, setExistingProject] = useState<Project | null>(null);

  const trimmedPath = path.trim();
  const canSubmit = !loading && !descriptionGenerating && trimmedPath.length > 0;

  function resetForm(): void {
    setPath("");
    setAlias("");
    setDescription("");
    setDescriptionGenerating(false);
    setIcon(DEFAULT_PROJECT_ICON);
    setLoading(false);
    setPicking(false);
    setExistingProject(null);
  }

  async function openExistingProject(project: Project): Promise<void> {
    if (registerOnly) {
      handleOpenChange(false);
      onRegistered?.(project.id);
      return;
    }

    try {
      await openExisting(project.id);
      if (replaceNewTabId) {
        replaceNewTabWithRepository(replaceNewTabId, project.id);
      } else {
        openRepositoryTab(project.id);
      }
      handleOpenChange(false);
      navigate(`/repo/${project.id}`);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  }

  async function handlePickDirectory(): Promise<void> {
    if (picking || loading || descriptionGenerating) {
      return;
    }
    // 先发起选目录，再更新按钮态，避免重渲染拖慢系统对话框
    const pickPromise = projectService.pickDirectory();
    setPicking(true);

    try {
      const selectedPath = await pickPromise;
      if (selectedPath) {
        setPath(selectedPath);
      }
    } catch (pickError) {
      toast.error(toUserMessage(pickError));
    } finally {
      setPicking(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setLoading(true);

    try {
      if (registerOnly) {
        const result = await addProject({
          path: trimmedPath,
          name: alias.trim() || undefined,
          description: description.trim() || undefined,
          icon,
        });
        if (result.alreadyExists) {
          setExistingProject(result.project);
          setLoading(false);
          return;
        }
        handleOpenChange(false);
        onRegistered?.(result.project.id);
        toast.success(t("projectManager.manageRegisterSuccess", { name: result.project.name }));
        return;
      }

      const result = await addAndOpen({
        path: trimmedPath,
        name: alias.trim() || undefined,
        description: description.trim() || undefined,
        icon,
      });
      if (result.alreadyExists) {
        setExistingProject(result.project);
        setLoading(false);
        return;
      }
      if (replaceNewTabId) {
        replaceNewTabWithRepository(replaceNewTabId, result.project.id);
      } else {
        openRepositoryTab(result.project.id);
      }
      handleOpenChange(false);
      navigate(`/repo/${result.project.id}`);
    } catch (submitError) {
      toast.error(toUserMessage(submitError));
      setLoading(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <AppDialogContent>
          <DialogHeader>
            <DialogTitle>{t("openRepo.title")}</DialogTitle>
            <DialogDescription>{t("openRepo.description")}</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor="repo-path">{t("openRepo.pathLabel")}</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="repo-path"
                    value={path}
                    onChange={(event) => setPath(event.target.value)}
                    placeholder={t("openRepo.pathPlaceholder")}
                    autoComplete="off"
                    disabled={loading || descriptionGenerating}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handlePickDirectory()}
                    disabled={loading || picking || descriptionGenerating}
                  >
                    <FolderOpen aria-hidden="true" />
                    {t("openRepo.pickButton")}
                  </Button>
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor="repo-alias">{t("openRepo.aliasLabel")}</FieldLabel>
                <Input
                  id="repo-alias"
                  value={alias}
                  onChange={(event) => setAlias(event.target.value)}
                  placeholder={t("openRepo.aliasPlaceholder")}
                  autoComplete="off"
                  disabled={loading || descriptionGenerating}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="open-repo-icon">{t("projectManager.projectIcon")}</FieldLabel>
                <LucideIconPicker
                  id="open-repo-icon"
                  value={icon}
                  onValueChange={setIcon}
                  disabled={loading || descriptionGenerating}
                  {...lucideIconPickerI18n(t)}
                />
              </Field>

              <ProjectDescriptionField
                value={description}
                onChange={setDescription}
                repoPath={path}
                disabled={loading}
                generating={descriptionGenerating}
                onGeneratingChange={setDescriptionGenerating}
                fieldId="open-repo-description"
                compact
              />
            </FieldGroup>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                <ButtonLoadingContent loading={loading} loadingLabel={t("common.loading")}>
                  {t("openRepo.submitButton")}
                </ButtonLoadingContent>
              </Button>
            </DialogFooter>
          </form>
        </AppDialogContent>
      </Dialog>

      <ExistingProjectDialog
        open={existingProject !== null}
        project={existingProject}
        action={registerOnly ? "view" : "open"}
        onOpenChange={(next) => {
          if (!next) {
            setExistingProject(null);
          }
        }}
        onConfirm={(project) => {
          setExistingProject(null);
          void openExistingProject(project);
        }}
      />
    </>
  );
}
