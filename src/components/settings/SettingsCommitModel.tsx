import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SelectMenu } from "@/components/common/SelectMenu";
import { SettingsFieldHeading } from "@/components/settings/SettingsFieldHeading";
import { SettingsPreferenceGroup } from "@/components/settings/SettingsPreferenceGroup";
import { SettingsPreferenceRow } from "@/components/settings/SettingsPreferenceRow";
import {
  fetchDeepSeekModels,
  formatDeepSeekModelLabel,
  formatDeepSeekModelShortLabel,
  readCommitModelId,
  writeCommitModelId,
  type DeepSeekModelInfo,
} from "@/services/ai/ai.models";

interface SettingsCommitModelProps {
  hasEnabledKey: boolean;
  /** 进入鲸灵分类或 Key 变更后刷新可用模型 */
  refreshToken: string;
}

/** 设置 → 鲸灵：配置生成提交信息所用模型。 */
export function SettingsCommitModel({ hasEnabledKey, refreshToken }: SettingsCommitModelProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<DeepSeekModelInfo[]>([]);
  const [modelId, setModelId] = useState(() => readCommitModelId());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      if (!hasEnabledKey) {
        if (!active) return;
        setModels([]);
        // 无 Key 时保留本地已选，便于展示；下拉禁用且无选项
        setModelId(readCommitModelId());
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const next = await fetchDeepSeekModels();
        if (!active) return;
        setModels(next);
        const ids = next.map((item) => item.id);
        const selected = readCommitModelId(ids);
        setModelId(selected);
        if (selected) {
          writeCommitModelId(selected);
        }
      } catch {
        if (!active) return;
        setModels([]);
        setModelId(readCommitModelId([]));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [hasEnabledKey, refreshToken]);

  const options = models.map((model) => ({
    value: model.id,
    label: formatDeepSeekModelLabel(model.id),
    shortLabel: formatDeepSeekModelShortLabel(model.id),
  }));
  // 暂无可用模型时仍展示已选/默认值，避免 Select 空 value。
  const displayOptions =
    options.length > 0
      ? options
      : modelId
        ? [
            {
              value: modelId,
              label: formatDeepSeekModelLabel(modelId),
              shortLabel: formatDeepSeekModelShortLabel(modelId),
            },
          ]
        : [];

  const description = !hasEnabledKey
    ? t("settings.commitModelNeedKey")
    : loading
      ? t("settings.commitModelLoading")
      : models.length === 0
        ? t("settings.commitModelEmpty")
        : t("settings.commitModelHint");

  return (
    <div className="space-y-2">
      <SettingsFieldHeading
        icon={<Cpu />}
        tip={t("settings.commitModelTip")}
        tipAria={t("settings.commitModelTipAria")}
      >
        {t("settings.commitModel")}
      </SettingsFieldHeading>
      <SettingsPreferenceGroup>
        <SettingsPreferenceRow label={t("settings.commitModelSelect")} description={description}>
          <SelectMenu
            value={modelId}
            options={displayOptions}
            onChange={(value) => {
              setModelId(value);
              writeCommitModelId(value);
            }}
            ariaLabel={t("settings.commitModelSelect")}
            disabled={!hasEnabledKey || loading || options.length === 0}
            triggerClassName="h-8 w-48 max-w-[40vw]"
          />
        </SettingsPreferenceRow>
      </SettingsPreferenceGroup>
    </div>
  );
}
