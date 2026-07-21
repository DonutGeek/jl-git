import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  fetchDeepSeekBalance,
  getDeepSeekTopUpUrl,
  pickPreferredBalance,
  type DeepSeekBalanceResult,
} from "@/services/ai/ai.balance";
import { openExternalUrl } from "@/services/system/open-url";
import { cn } from "@/lib/utils";
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

  async function handleRefresh(): Promise<void> {
    if (!hasEnabledKey || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchDeepSeekBalance();
      setResult(next);
    } catch (err) {
      setResult(null);
      setError(toUserMessage(err) || t("settings.balanceFetchFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleTopUp(): Promise<void> {
    try {
      await openExternalUrl(getDeepSeekTopUpUrl());
    } catch (err) {
      toast.error(toUserMessage(err) || t("settings.balanceTopUpFailed"));
    }
  }

  const preferred = result ? pickPreferredBalance(result.balances) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Wallet className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-xs font-medium">{t("settings.balanceTitle")}</p>
          <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
            {t("settings.balanceHint")}
          </p>
        </div>
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
            <>
              <p className="text-foreground text-lg font-semibold tracking-tight">
                {formatBalanceLabel(preferred.totalBalance, preferred.currency)}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {result?.isAvailable
                  ? t("settings.balanceAvailable")
                  : t("settings.balanceUnavailable")}
                {" · "}
                {t("settings.balanceDetail", {
                  toppedUp: preferred.toppedUpBalance,
                  granted: preferred.grantedBalance,
                })}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-xs">{t("settings.balanceEmpty")}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs shadow-none"
            disabled={!hasEnabledKey || loading}
            onClick={() => {
              void handleRefresh();
            }}
          >
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
              aria-hidden="true"
            />
            {t("settings.balanceRefresh")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              void handleTopUp();
            }}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {t("settings.balanceTopUp")}
          </Button>
        </div>
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
