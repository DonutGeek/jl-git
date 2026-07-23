import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { getAppInfo } from "@/services/system/system.info";
import {
  detectAppOs,
  resolveWindowHeaderPaddingClass,
  type AppOs,
} from "@/services/window/windowChrome";

export interface WindowChromeLayout {
  os: AppOs;
  /** mac Overlay：左侧为交通灯留白 */
  isMacOverlay: boolean;
  isFullscreen: boolean;
  headerPaddingClass: string;
}

/** 顶栏平台布局：mac Overlay 留白；Win / Linux 系统装饰。 */
export function useWindowChromeLayout(): WindowChromeLayout {
  const [os, setOs] = useState<AppOs>(() => detectAppOs());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAppInfo()
      .then((info) => {
        if (!cancelled && info.os) {
          setOs(info.os);
        }
      })
      .catch(() => {
        /* 保持 UA 兜底 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (os !== "macos") {
      setIsFullscreen(false);
      return;
    }

    let cancelled = false;
    let unlistenResize: (() => void) | undefined;
    let syncVersion = 0;
    let current: ReturnType<typeof getCurrentWindow>;
    try {
      current = getCurrentWindow();
    } catch {
      /* 浏览器预览环境没有 Tauri 窗口，保留普通窗口布局。 */
      setIsFullscreen(false);
      return;
    }

    const syncFullscreen = async (): Promise<void> => {
      const version = ++syncVersion;
      try {
        const next = await current.isFullscreen();
        if (!cancelled && version === syncVersion) {
          setIsFullscreen(next);
        }
      } catch {
        if (!cancelled && version === syncVersion) {
          setIsFullscreen(false);
        }
      }
    };

    void syncFullscreen();
    void current
      .onResized(() => {
        void syncFullscreen();
      })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        unlistenResize = unlisten;
      })
      .catch(() => {
        /* 浏览器预览环境没有窗口事件，保留普通窗口布局。 */
      });

    return () => {
      cancelled = true;
      unlistenResize?.();
    };
  }, [os]);

  const isMacOverlay = os === "macos";

  return {
    os,
    isMacOverlay,
    isFullscreen,
    headerPaddingClass: resolveWindowHeaderPaddingClass(os, isFullscreen),
  };
}
