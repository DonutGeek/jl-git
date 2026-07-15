import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { projectService } from "@/services/project";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";

interface OpenRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replaceNewTabId?: string;
}

/** 打开本地仓库对话框：路径可输入/选择，别名可选 */
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
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedPath = path.trim();
  const canSubmit = !loading && trimmedPath.length > 0;

  function resetForm(): void {
    setPath("");
    setAlias("");
    setError(null);
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
    setPicking(true);
    setError(null);

    try {
      const selectedPath = await projectService.pickDirectory();
      if (selectedPath) {
        setPath(selectedPath);
      }
    } catch (pickError) {
      setError(toUserMessage(pickError));
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
    setError(null);

    try {
      const project = await addAndOpen({
        path: trimmedPath,
        name: alias.trim() || undefined,
      });
      if (replaceNewTabId) {
        replaceNewTabWithRepository(replaceNewTabId, project.id);
      } else {
        openRepositoryTab(project.id);
      }
      handleOpenChange(false);
      navigate(`/repo/${project.id}`);
    } catch (submitError) {
      setError(toUserMessage(submitError));
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

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="repo-path">
              {t("openRepo.pathLabel")}
            </label>
            <div className="flex gap-2">
              <Input
                id="repo-path"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder={t("openRepo.pathPlaceholder")}
                autoComplete="off"
                aria-invalid={Boolean(error)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handlePickDirectory()}
                disabled={loading || picking}
              >
                <FolderOpen aria-hidden="true" />
                {picking ? t("common.loading") : t("openRepo.pickButton")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="repo-alias">
              {t("openRepo.aliasLabel")}
            </label>
            <Input
              id="repo-alias"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder={t("openRepo.aliasPlaceholder")}
              autoComplete="off"
            />
          </div>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

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
