import { useEffect } from "react";

import { checkAppUpdate } from "@/services/system/system.updater";
import { useAppUpdateStore } from "@/store/useAppUpdateStore";

/** 运行中定时复查间隔 */
const PERIODIC_CHECK_MS = 4 * 60 * 60 * 1000;
/** 窗口重新可见时，距上次检查不足此时长则跳过 */
const FOCUS_MIN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * 正式包静默检查更新：启动一次 + 定时 + 窗口聚焦（节流）。
 * 开发态跳过；失败不弹窗，且不清除已展示的「有更新」。
 */
export function useAppUpdateChecker(): void {
  const setAvailableUpdate = useAppUpdateStore((state) => state.setAvailableUpdate);

  useEffect(() => {
    if (import.meta.env.DEV) {
      return;
    }

    let cancelled = false;
    let lastCheckedAt = 0;
    let inFlight: Promise<void> | null = null;

    async function runCheck(reason: string): Promise<void> {
      if (cancelled) {
        return;
      }
      if (inFlight) {
        return inFlight;
      }

      inFlight = (async () => {
        try {
          const info = await checkAppUpdate();
          if (cancelled) {
            return;
          }
          lastCheckedAt = Date.now();
          setAvailableUpdate(info);
        } catch (error: unknown) {
          console.warn(`[updater] ${reason} check failed`, error);
          // 网络抖动时保留已有更新提示，避免按钮被误清
        } finally {
          inFlight = null;
        }
      })();

      return inFlight;
    }

    void runCheck("startup");

    const timerId = window.setInterval(() => {
      void runCheck("periodic");
    }, PERIODIC_CHECK_MS);

    const maybeCheckOnFocus = (): void => {
      if (Date.now() - lastCheckedAt < FOCUS_MIN_INTERVAL_MS) {
        return;
      }
      void runCheck("focus");
    };

    const handleFocus = (): void => {
      maybeCheckOnFocus();
    };

    const handleVisibility = (): void => {
      if (document.visibilityState === "visible") {
        maybeCheckOnFocus();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [setAvailableUpdate]);
}
