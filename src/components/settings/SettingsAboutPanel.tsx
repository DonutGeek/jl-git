import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getTauriVersion } from "@tauri-apps/api/app";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import appIconUrl from "@/assets/app-icon.png";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getGitVersion } from "@/services/git/git.version";
import { getAppInfo, type SystemAppInfo } from "@/services/system/system.info";
import { checkAppUpdate, installPendingAppUpdate } from "@/services/system/system.updater";
import { useAppUpdateStore } from "@/store/useAppUpdateStore";
import { toUserMessage } from "@/types/error";

function formatOsLabel(os: string): string {
  switch (os) {
    case "macos":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return os || "—";
  }
}

/** 设置 → 关于：居中品牌块，垂直中部偏上（原版气质） */
export function SettingsAboutPanel() {
  const { t } = useTranslation();

  const [appInfo, setAppInfo] = useState<SystemAppInfo | null>(null);
  const [tauriVersion, setTauriVersion] = useState<string | null>(null);
  const [gitVersion, setGitVersion] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const availableUpdate = useAppUpdateStore((state) => state.availableUpdate);
  const setAvailableUpdate = useAppUpdateStore((state) => state.setAvailableUpdate);

  async function handleCheckUpdate(): Promise<void> {
    if (checkingUpdate || installingUpdate) {
      return;
    }
    if (import.meta.env.DEV) {
      toast.message(t("statusBar.updateDevHint"));
      return;
    }
    setCheckingUpdate(true);
    const toastId = toast.loading(t("statusBar.updateChecking"));
    try {
      const info = await checkAppUpdate();
      if (!info) {
        setAvailableUpdate(null);
        toast.success(t("statusBar.updateUpToDate"), { id: toastId });
        return;
      }
      setAvailableUpdate(info);
      toast.success(
        t("statusBar.updateAvailable", {
          version: info.version,
          current: info.currentVersion,
        }),
        { id: toastId },
      );
    } catch (error) {
      setAvailableUpdate(null);
      toast.error(toUserMessage(error) || t("statusBar.updateCheckFailed"), {
        id: toastId,
      });
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleInstallUpdate(): Promise<void> {
    if (!availableUpdate || installingUpdate) {
      return;
    }
    setInstallingUpdate(true);
    const toastId = toast.loading(t("statusBar.updateDownloading"));
    try {
      const info = await checkAppUpdate();
      if (!info) {
        setAvailableUpdate(null);
        toast.success(t("statusBar.updateUpToDate"), { id: toastId });
        return;
      }
      setAvailableUpdate(info);
      await installPendingAppUpdate();
    } catch (error) {
      toast.error(toUserMessage(error) || t("statusBar.updateFailed"), {
        id: toastId,
      });
    } finally {
      setInstallingUpdate(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([getAppInfo(), getTauriVersion(), getGitVersion()]).then(
      ([appResult, tauriResult, gitResult]) => {
        if (cancelled) {
          return;
        }
        if (appResult.status === "fulfilled") {
          setAppInfo(appResult.value);
        }
        if (tauriResult.status === "fulfilled") {
          setTauriVersion(tauriResult.value);
        }
        if (gitResult.status === "fulfilled") {
          setGitVersion(gitResult.value.version);
        } else {
          setGitVersion(null);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const metaChips = [
    appInfo ? formatOsLabel(appInfo.os) : null,
    appInfo?.arch || null,
    tauriVersion ? `Tauri ${tauriVersion}` : null,
    gitVersion,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="flex min-h-[min(28rem,62vh)] w-full flex-col items-center justify-start pt-[min(12vh,5rem)] pb-10">
      <div className="flex max-w-md flex-col items-center text-center">
        <img
          src={appIconUrl}
          alt=""
          width={80}
          height={80}
          className="border-border bg-muted/40 size-20 rounded-2xl border"
          draggable={false}
        />
        <h2 className="text-foreground mt-4 text-lg font-semibold tracking-tight">
          {t("common.productName")}
        </h2>
        <p className="text-muted-foreground mt-1 font-mono text-xs tabular-nums">
          v{appInfo?.version ?? "—"}
        </p>
        <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
          {t("settings.aboutCopyright")}
        </p>
        {metaChips.length > 0 ? (
          <ul className="mt-4 flex max-w-md flex-wrap items-center justify-center gap-1.5">
            {metaChips.map((chip) => (
              <li
                key={chip}
                className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 font-mono text-[11px]"
              >
                {chip}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={checkingUpdate || installingUpdate}
            aria-label={t("settings.aboutCheckUpdateAria")}
            onClick={() => {
              void handleCheckUpdate();
            }}
          >
            {checkingUpdate ? (
              <Spinner className="size-3.5" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            {t("settings.aboutCheckUpdate")}
          </Button>
          {availableUpdate ? (
            <Button
              type="button"
              size="sm"
              disabled={installingUpdate || checkingUpdate}
              onClick={() => {
                void handleInstallUpdate();
              }}
            >
              {installingUpdate ? <Spinner className="size-3.5" /> : null}
              {t("settings.aboutUpdateInstall")}
              <span className="font-mono tabular-nums">v{availableUpdate.version}</span>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
