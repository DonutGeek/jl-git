import { useEffect, useState } from "react";

import { getAppInfo } from "@/services/system/system.info";
import { detectAppOs, type AppOs } from "@/services/window/windowChrome";

export interface WindowChromeLayout {
  os: AppOs;
  /** mac Overlay：左侧为交通灯留白 */
  isMacOverlay: boolean;
  /** Windows：显示自绘最小化 / 最大化·还原 / 关闭 */
  showWinControls: boolean;
  headerPaddingClass: string;
}

/** 顶栏平台布局：mac 保持 pl-[88px]；Win / 其他用紧凑左内边距。 */
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
  const showWinControls = os === "windows";

  return {
    os,
    isMacOverlay,
    showWinControls,
    headerPaddingClass: isMacOverlay ? "pl-[88px]" : "pl-3",
  };
}
