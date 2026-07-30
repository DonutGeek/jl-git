import type { FormEvent } from "react";
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CloneProjectDetailDialog } from "@/components/project/CloneProjectDetailDialog";
import { ProjectIconPicker } from "@/components/project/ProjectIconPicker";
import { WorkspaceSelectMenu } from "@/components/project/WorkspaceSelectMenu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

import { cloneRepository } from "@/services/git/git.clone";
import { projectService } from "@/services/project";
import { useProjectStore } from "@/store/useProjectStore";
import { toUserMessage } from "@/types/error";
import { DEFAULT_PROJECT_ICON, type ProjectIcon as ProjectIconName } from "@/types/project";
import { joinCloneDestPath, repoNameFromCloneUrl } from "@/utils/gitClonePath";

interface CloneRepoPanelProps {
  onOpenProject: (projectId: string) => void;
  disabled?: boolean;
}

interface PendingDetailSession {
  projectId: string;
  projectName: string;
  repoPath: string;
  openAfter: boolean;
}

/** 新标签页「克隆」：仓库地址 + 存放路径，布局对齐「打开」表单 */
export function CloneRepoPanel({ onOpenProject, disabled = false }: CloneRepoPanelProps) {
  const { t } = useTranslation();
  const addAndOpen = useProjectStore((state) => state.addAndOpen);
  const addProject = useProjectStore((state) => state.addProject);
  const openExisting = useProjectStore((state) => state.openExisting);

  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [suggestedRepoName, setSuggestedRepoName] = useState("");
  const [alias, setAlias] = useState("");
  const [aliasEdited, setAliasEdited] = useState(false);
  const [fillDetailAfterClone, setFillDetailAfterClone] = useState(false);
  const [projectIcon, setProjectIcon] = useState<ProjectIconName>(DEFAULT_PROJECT_ICON);
  const [workspaceId, setWorkspaceId] = useState("");
  const [cloning, setCloning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pendingDetail, setPendingDetail] = useState<PendingDetailSession | null>(null);

  const busy = cloning || picking || pendingDetail !== null || disabled;
  const canSubmit = !busy && url.trim().length > 0 && path.trim().length > 0;

  function resetForm(): void {
    setUrl("");
    setPath("");
    setSuggestedRepoName("");
    setAlias("");
    setAliasEdited(false);
    setFillDetailAfterClone(false);
    setProjectIcon(DEFAULT_PROJECT_ICON);
    setWorkspaceId("");
  }

  function handleUrlChange(nextUrl: string): void {
    setUrl(nextUrl);
    const repoName = repoNameFromCloneUrl(nextUrl);
    setSuggestedRepoName(repoName);
    if (!aliasEdited && repoName) {
      setAlias(repoName);
    }
  }

  function handleAliasChange(next: string): void {
    setAliasEdited(true);
    setAlias(next);
  }

  async function pickParentDirectory(): Promise<void> {
    if (busy) {
      return;
    }
    const pickPromise = projectService.pickDirectory();
    setPicking(true);
    try {
      const selected = await pickPromise;
      if (!selected) {
        return;
      }
      const name = suggestedRepoName || repoNameFromCloneUrl(url) || "repository";
      setSuggestedRepoName(name);
      setPath(joinCloneDestPath(selected, name));
      if (!aliasEdited) {
        setAlias(name);
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setPicking(false);
    }
  }

  async function finishCloneSession(session: PendingDetailSession): Promise<void> {
    setPendingDetail(null);
    if (!session.openAfter) {
      return;
    }
    try {
      await openExisting(session.projectId);
      onOpenProject(session.projectId);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function runClone(openAfter: boolean): Promise<void> {
    const remoteUrl = url.trim();
    const destPath = path.trim();
    if (!remoteUrl) {
      toast.error(t("cloneRepo.urlRequired"));
      return;
    }
    if (!destPath) {
      toast.error(t("cloneRepo.pathRequired"));
      return;
    }
    if (busy) {
      return;
    }

    const wantDetail = fillDetailAfterClone;
    setCloning(true);
    try {
      const cloned = await cloneRepository(remoteUrl, destPath);
      const input = {
        path: cloned.path,
        name: alias.trim() || undefined,
        workspaceId: workspaceId || undefined,
        icon: projectIcon,
      };

      // 勾选「克隆后填写详情」时先只登记，避免弹窗前就切到仓库
      const project = openAfter && !wantDetail ? await addAndOpen(input) : await addProject(input);

      resetForm();

      if (wantDetail) {
        toast.success(t("cloneRepo.cloned", { name: project.name }));
        setPendingDetail({
          projectId: project.id,
          projectName: project.name,
          repoPath: cloned.path,
          openAfter,
        });
        return;
      }

      toast.success(
        openAfter
          ? t("cloneRepo.success", { name: project.name })
          : t("cloneRepo.cloneAndContinueSuccess", { name: project.name }),
      );
      if (openAfter) {
        onOpenProject(project.id);
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setCloning(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await runClone(true);
  }

  return (
    <>
      <ScrollArea className="-mr-6 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <form
          className="max-w-2xl space-y-6 pr-6 pb-2"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="clone-repo-url">{t("cloneRepo.urlLabel")}</FieldLabel>
              <Input
                id="clone-repo-url"
                value={url}
                onChange={(event) => handleUrlChange(event.target.value)}
                placeholder={t("cloneRepo.urlPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="clone-repo-path">{t("cloneRepo.pathLabel")}</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="clone-repo-path"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  placeholder={t("cloneRepo.pathPlaceholder")}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void pickParentDirectory()}
                >
                  <FolderOpen className="size-4" aria-hidden="true" />
                  {t("cloneRepo.pickButton")}
                </Button>
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="clone-repo-alias">{t("openRepo.aliasLabel")}</FieldLabel>
              <Input
                id="clone-repo-alias"
                value={alias}
                onChange={(event) => handleAliasChange(event.target.value)}
                placeholder={t("openRepo.aliasPlaceholder")}
                autoComplete="off"
                disabled={busy}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="clone-repo-icon">{t("projectManager.projectIcon")}</FieldLabel>
                <ProjectIconPicker
                  id="clone-repo-icon"
                  value={projectIcon}
                  onValueChange={setProjectIcon}
                  disabled={busy}
                />
              </Field>
              <Field>
                <FieldLabel>{t("projectManager.workspaceLabel")}</FieldLabel>
                <WorkspaceSelectMenu
                  value={workspaceId}
                  onChange={setWorkspaceId}
                  ariaLabel={t("projectManager.workspaceLabel")}
                  disabled={busy}
                  triggerClassName="h-9"
                />
              </Field>
            </div>

            <Field orientation="horizontal">
              <Checkbox
                id="clone-fill-detail"
                checked={fillDetailAfterClone}
                onCheckedChange={(checked) => setFillDetailAfterClone(checked === true)}
                disabled={busy}
              />
              <FieldContent>
                <FieldLabel htmlFor="clone-fill-detail">
                  {t("cloneRepo.fillDetailAfterClone")}
                </FieldLabel>
              </FieldContent>
            </Field>
          </FieldGroup>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={!canSubmit}>
              {cloning ? t("cloneRepo.cloning") : t("cloneRepo.submitButton")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canSubmit}
              onClick={() => void runClone(false)}
            >
              {t("cloneRepo.cloneAndContinue")}
            </Button>
          </div>
        </form>
      </ScrollArea>

      {pendingDetail ? (
        <CloneProjectDetailDialog
          open
          projectId={pendingDetail.projectId}
          projectName={pendingDetail.projectName}
          repoPath={pendingDetail.repoPath}
          onFinished={() => void finishCloneSession(pendingDetail)}
        />
      ) : null}
    </>
  );
}
