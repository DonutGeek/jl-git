import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import { generateProjectDescription, toastAiFailure } from "@/services/ai";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useSettingsDrawerStore } from "@/store/useSettingsDrawerStore";

interface ProjectDescriptionFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** 本地仓库路径：AI 生成时读取 README / 清单 */
  repoPath: string;
  disabled?: boolean;
  generating: boolean;
  onGeneratingChange: (generating: boolean) => void;
  /** 避免同页多实例时 label/id 冲突 */
  fieldId?: string;
  placeholder?: string;
  /** 紧凑高度（打开仓库等对话框） */
  compact?: boolean;
}

/** 项目详情 Textarea + 右下角 AI 生成简介 */
export function ProjectDescriptionField({
  value,
  onChange,
  repoPath,
  disabled = false,
  generating,
  onGeneratingChange,
  fieldId = "project-description",
  placeholder,
  compact = false,
}: ProjectDescriptionFieldProps) {
  const { t } = useTranslation();
  const hasApiKey = useHasAgentApiKey();
  const locale = useLocaleStore((state) => state.locale);
  const openSettingsDrawer = useSettingsDrawerStore((state) => state.openDrawer);

  const trimmedPath = repoPath.trim();
  const canGenerate = hasApiKey && trimmedPath.length > 0 && !disabled && !generating;

  async function handleGenerate(): Promise<void> {
    if (!hasApiKey) {
      openSettingsDrawer("ai");
      return;
    }
    if (!canGenerate) {
      return;
    }

    onGeneratingChange(true);
    try {
      const description = await generateProjectDescription(trimmedPath, locale);
      onChange(description);
      toast.success(t("openRepo.descriptionGenerateSuccess"));
    } catch (error) {
      toastAiFailure(error, t("openRepo.descriptionGenerateFailed"));
    } finally {
      onGeneratingChange(false);
    }
  }

  const ariaLabel = !hasApiKey
    ? t("common.aiApiKeyRequired")
    : !trimmedPath
      ? t("openRepo.descriptionNeedPath")
      : t("openRepo.descriptionGenerate");

  const tooltip = !hasApiKey
    ? t("common.aiApiKeyRequired")
    : !trimmedPath
      ? t("openRepo.descriptionNeedPath")
      : generating
        ? t("openRepo.descriptionGenerating")
        : t("openRepo.descriptionGenerate");

  return (
    <Field>
      <FieldLabel htmlFor={fieldId}>{t("openRepo.detailLabel")}</FieldLabel>
      <div className="relative">
        <Textarea
          id={fieldId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? t("openRepo.detailPlaceholder")}
          disabled={disabled || generating}
          className={compact ? "min-h-16 resize-y pb-9 text-xs" : "min-h-28 resize-y pb-10"}
        />
        <div className="absolute right-2 bottom-2">
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground size-7"
                  aria-label={ariaLabel}
                  disabled={!canGenerate && hasApiKey}
                  onClick={() => void handleGenerate()}
                >
                  {generating ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <Sparkles className="size-3.5" aria-hidden="true" />
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Field>
  );
}
