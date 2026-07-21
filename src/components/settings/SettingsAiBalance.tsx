import { useEffect, useState } from "react";
import { CircleHelp, ExternalLink, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fetchDeepSeekBalance,
  getDeepSeekBalanceDocsUrl,
  getDeepSeekTopUpUrl,
  pickPreferredBalance,
  type DeepSeekBalanceResult,
} from "@/services/ai/ai.balance";
import { openExternalUrl } from "@/services/system/open-url";
import { toUserMessage } from "@/types/error";

interface SettingsAiBalanceProps {
  /** 是否已配置可用 API Key */
  hasEnabledKey: boolean;
  /** 进入鲸灵分类或 Key 变更后触发刷新 */
  refreshToken: string;
}

/** 设置 → 鲸灵：DeepSeek 账户余额与充值入口 */
export function SettingsAiBalance({
  hasEnabledKey,
  refreshToken,
}: SettingsAiBalanceProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeepSeekBalanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasEnabledKey) {
      setResult(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchDeepSeekBalance()
      .then((next) => {
        if (!cancelled) {
          setResult(next);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult(null);
          setError(toUserMessage(err) || t("settings.balanceFetchFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hasEnabledKey, refreshToken, t]);

  async function handleTopUp(): Promise<void> {
    try {
      await openExternalUrl(getDeepSeekTopUpUrl());
    } catch (err) {
      toast.error(toUserMessage(err) || t("settings.balanceTopUpFailed"));
    }
  }

  async function handleOpenDocs(): Promise<void> {
    try {
      await openExternalUrl(getDeepSeekBalanceDocsUrl());
    } catch (err) {
      toast.error(toUserMessage(err) || t("settings.balanceDocsFailed"));
    }
  }

  const preferred = result ? pickPreferredBalance(result.balances) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Wallet className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <p className="text-foreground text-xs font-medium">{t("settings.balanceTitle")}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground inline-flex size-4 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("settings.balanceTipAria")}
            >
              <CircleHelp className="size-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          {/* 覆盖默认 text-balance，与设置内其他问号提示一致 */}
          <TooltipContent
            side="top"
            className="max-w-xs text-left leading-relaxed text-pretty text-wrap"
          >
            <span>
              {t("settings.balanceTip")}
              <button
                type="button"
                className="ml-0.5 underline-offset-2 hover:underline"
                onClick={() => {
                  void handleOpenDocs();
                }}
              >
                {t("settings.balanceViewDocs")}
              </button>
            </span>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-3">
        <div className="min-w-0">
          {!hasEnabledKey ? (
            <p className="text-muted-foreground text-xs">{t("settings.balanceNeedKey")}</p>
          ) : loading && !result ? (
            <p className="text-muted-foreground text-xs">{t("common.loading")}</p>
          ) : error ? (
            <p className="text-destructive text-xs">{error}</p>
          ) : preferred ? (
            <p className="text-foreground text-lg font-semibold tracking-tight">
              {formatBalanceLabel(preferred.totalBalance, preferred.currency)}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">{t("settings.balanceEmpty")}</p>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 gap-1.5 text-xs"
          onClick={() => {
            void handleTopUp();
          }}
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          {t("settings.balanceTopUp")}
        </Button>
      </div>
    </div>
  );
}

function formatBalanceLabel(amount: string, currency: string): string {
  if (currency === "CNY") {
    return `¥${amount} CNY`;
  }
  if (currency === "USD") {
    return `$${amount} USD`;
  }
  return `${amount} ${currency}`;
}
