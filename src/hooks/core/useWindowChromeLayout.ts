import { computed, onMounted, onUnmounted, ref } from "vue";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { getAppInfo } from "@/api/system/system.info";
import {
  detectAppOs,
  resolveWindowHeaderPaddingClass,
  type AppOs,
} from "@/services/window/windowChrome";

/** 顶栏平台布局：mac Overlay 留白；Win / Linux 系统装饰 */
export function useWindowChromeLayout() {
  const os = ref<AppOs>(detectAppOs());
  const isFullscreen = ref(false);
  const isMacOverlay = computed(() => os.value === "macos");
  const headerPaddingClass = computed(() =>
    resolveWindowHeaderPaddingClass(os.value, isFullscreen.value),
  );

  onMounted(() => {
    let disposed = false;
    let unlistenResize: (() => void) | undefined;

    void getAppInfo()
      .then((info) => {
        if (!disposed && info.os) {
          os.value = info.os;
        }
      })
      .catch(() => {
        /* 保持 UA 兜底 */
      });

    try {
      const current = getCurrentWindow();
      const syncFullscreen = async (): Promise<void> => {
        try {
          const next = await current.isFullscreen();
          if (!disposed) {
            isFullscreen.value = next;
          }
        } catch {
          if (!disposed) {
            isFullscreen.value = false;
          }
        }
      };

      void syncFullscreen();
      void current
        .onResized(() => {
          void syncFullscreen();
        })
        .then((unlisten) => {
          if (disposed) {
            unlisten();
            return;
          }
          unlistenResize = unlisten;
        })
        .catch(() => {
          /* 浏览器预览没有窗口事件 */
        });
    } catch {
      isFullscreen.value = false;
    }

    onUnmounted(() => {
      disposed = true;
      unlistenResize?.();
    });
  });

  return {
    os,
    isMacOverlay,
    isFullscreen,
    headerPaddingClass,
  };
}
