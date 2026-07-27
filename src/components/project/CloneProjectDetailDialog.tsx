import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ProjectDescriptionField } from "@/components/project/ProjectDescriptionField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { generateProjectDescription, toastAiFailure } from "@/services/ai";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useProjectStore } from "@/store/useProjectStore";
import { toUserMessage } from "@/types/error";

interface CloneProjectDetailDialogProps {
  open: boolean;
  projectId: string;
  projectName: string;
  repoPath: string;
  /** 确定 / 跳过 / 关闭后回调（父级再决定是否打开仓库） */
  onFinished: () => void;
}

/** 克隆后可选：填写或 AI 生成项目详情 */
export function CloneProjectDetailDialog({
  open,
  projectId,
  projectName,
  repoPath,
  onFinished,
}: CloneProjectDetailDialogProps) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const updateProject = useProjectStore((state) => state.updateProject);

  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDescription("");
    setSaving(false);

    let cancelled = false;
    setGenerating(true);
    void (async () => {
      try {
        const next = await generateProjectDescription(repoPath, locale);
        if (!cancelled) {
          setDescription(next);
        }
      } catch (error) {
        if (!cancelled) {
          toastAiFailure(error, t("openRepo.descriptionGenerateFailed"));
        }
      } finally {
        if (!cancelled) {
          setGenerating(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, projectId, repoPath, locale, t]);

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && !saving) {
      onFinished();
    }
  }

  async function handleConfirm(): Promise<void> {
    if (saving || generating) {
      return;
    }
    setSaving(true);
    try {
      await updateProject({
        id: projectId,
        description: description.trim() || null,
      });
      toast.success(t("cloneRepo.detailSaved"));
      onFinished();
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
          <DialogTitle>{t("cloneRepo.detailDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("cloneRepo.detailDialogDescription", { name: projectName })}
          </DialogDescription>
        </DialogHeader>

        <ProjectDescriptionField
          value={description}
          onChange={setDescription}
          repoPath={repoPath}
          disabled={saving}
          generating={generating}
          onGeneratingChange={setGenerating}
          fieldId="clone-post-detail"
        />

        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onFinished}>
            {t("cloneRepo.detailSkip")}
          </Button>
          <Button
            type="button"
            disabled={saving || generating}
            onClick={() => void handleConfirm()}
          >
            {saving ? t("common.loading") : t("cloneRepo.detailConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
