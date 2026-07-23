import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

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

import { projectService } from "@/services/project";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";
import {
  DEFAULT_PROJECT_ICON,
  type ProjectIcon,
} from "@/types/project";

interface OpenRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replaceNewTabId?: string;
}

/** 打开本地仓库对话框：路径可输入/选择，别名与项目详情可选 */
export function OpenRepoDialog({ open, onOpenChange, replaceNewTabId }: OpenRepoDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const addAndOpen = useProjectStore((state) => state.addAndOpen);
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

  const trimmedPath = path.trim();
  const canSubmit =
    !loading && !descriptionGenerating && trimmedPath.length > 0;

  function resetForm(): void {
    setPath("");
    setAlias("");
    setDescription("");
    setDescriptionGenerating(false);
    setIcon(DEFAULT_PROJECT_ICON);
    setLoading(false);
    setPicking(false);
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
      const project = await addAndOpen({
        path: trimmedPath,
        name: alias.trim() || undefined,
        description: description.trim() || undefined,
        icon,
      });
      if (replaceNewTabId) {
        replaceNewTabWithRepository(replaceNewTabId, project.id);
      } else {
        openRepositoryTab(project.id);
      }
      handleOpenChange(false);
      navigate(`/repo/${project.id}`);
    } catch (submitError) {
      toast.error(toUserMessage(submitError));
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("openRepo.title")}</DialogTitle>
          <DialogDescription>{t("openRepo.description")}</DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="repo-path">
              {t("openRepo.pathLabel")}
              </FieldLabel>
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
              <FieldLabel htmlFor="repo-alias">
              {t("openRepo.aliasLabel")}
              </FieldLabel>
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
              <FieldLabel htmlFor="open-repo-icon">
                {t("projectManager.projectIcon")}
              </FieldLabel>
              <ProjectIconPicker
                id="open-repo-icon"
                value={icon}
                onValueChange={setIcon}
                disabled={loading || descriptionGenerating}
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
            />
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {loading ? t("common.loading") : t("openRepo.submitButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
