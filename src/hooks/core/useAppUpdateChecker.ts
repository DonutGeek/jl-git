import { onMounted, onUnmounted } from "vue";

import { checkAppUpdate } from "@/services/system/system.updater";
import { useAppUpdateStore } from "@/store/modules/appUpdate";

const PERIODIC_CHECK_MS = 4 * 60 * 60 * 1000;
const FOCUS_MIN_INTERVAL_MS = 60 * 60 * 1000;

/** 正式包静默检查更新：启动一次 + 定时 + 窗口聚焦（节流） */
export function useAppUpdateChecker(): void {
  onMounted(() => {
    if (import.meta.env.DEV) {
      return;
    }

    let cancelled = false;
    let lastCheckedAt = 0;
    let inFlight: Promise<void> | null = null;

    async function runCheck(reason: string): Promise<void> {
      if (cancelled || inFlight) {
        return inFlight ?? undefined;
      }

      inFlight = (async () => {
        try {
          const info = await checkAppUpdate();
          if (cancelled) {
            return;
          }
          lastCheckedAt = Date.now();
          useAppUpdateStore().setAvailableUpdate(info);
        } catch (error: unknown) {
          console.warn(`[updater] ${reason} check failed`, error);
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

    onUnmounted(() => {
      cancelled = true;
      window.clearInterval(timerId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    });
  });
}
