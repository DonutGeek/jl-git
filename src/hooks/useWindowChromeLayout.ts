import { useEffect, useState } from "react";

import { getAppInfo } from "@/services/system/system.info";
import {
  detectAppOs,
  needsCustomChromeControls,
  type AppOs,
} from "@/services/window/windowChrome";

export interface WindowChromeLayout {
  os: AppOs;
  /** mac Overlay：左侧为交通灯留白 */
  isMacOverlay: boolean;
  /** 自绘三键：当前各平台均不需要（Win/Linux 系统装饰，mac 交通灯） */
  showCustomChromeControls: boolean;
  headerPaddingClass: string;
}

/** 顶栏平台布局：mac Overlay 留白；Win / Linux 系统装饰。 */
export function useWindowChromeLayout(): WindowChromeLayout {
  const [os, setOs] = useState<AppOs>(() => detectAppOs());

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

  const isMacOverlay = os === "macos";
  const showCustomChromeControls = needsCustomChromeControls(os);

  return {
    os,
    isMacOverlay,
    showCustomChromeControls,
    headerPaddingClass: isMacOverlay ? "pl-[88px]" : "pl-3",
  };
}
