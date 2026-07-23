import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

/**
 * 自绘窗口控制（最小化 / 最大化·还原 / 关闭）。
 * 当前 Win/Linux 已用系统装饰，组件保留以备无边框场景复用。
 */
export function WindowChromeControls() {
  const { t } = useTranslation("common");
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const current = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    async function syncMaximized(): Promise<void> {
      try {
        setMaximized(await current.isMaximized());
      } catch {
        /* 非 Tauri 环境忽略 */
      }
    }

    void syncMaximized();
    void current
      .onResized(() => {
        void syncMaximized();
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);

    return () => {
      unlisten?.();
    };
  }, []);

  async function minimize(): Promise<void> {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error(error);
    }
  }

  async function toggleMaximize(): Promise<void> {
    try {
      await getCurrentWindow().toggleMaximize();
      setMaximized(await getCurrentWindow().isMaximized());
    } catch (error) {
      console.error(error);
    }
  }

  async function close(): Promise<void> {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="flex h-full shrink-0 items-center" style={noDragStyle}>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground size-7 shrink-0 rounded-none"
            aria-label={t("windowMinimize")}
            onClick={() => void minimize()}
          >
            <Minus className="size-3.5" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("windowMinimize")}</TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground size-7 shrink-0 rounded-none"
            aria-label={maximized ? t("windowRestore") : t("windowMaximize")}
            onClick={() => void toggleMaximize()}
          >
            {maximized ? (
              <Copy className="size-3.5 scale-x-[-1]" aria-hidden="true" />
            ) : (
              <Square className="size-3" aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{maximized ? t("windowRestore") : t("windowMaximize")}</TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-destructive/90 hover:text-destructive-foreground size-7 shrink-0 rounded-none"
            aria-label={t("windowClose")}
            onClick={() => void close()}
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("windowClose")}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** 双击顶栏拖拽区：最大化 / 还原（失败则静默）。 */
export async function toggleCurrentWindowMaximize(): Promise<void> {
  try {
    await getCurrentWindow().toggleMaximize();
  } catch (error) {
    console.error(error);
  }
}
