import { computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useKeyboardShortcuts } from "@/hooks/core/useKeyboardShortcuts";
import { useShortcutAction } from "@/hooks/core/useShortcutAction";
import {
  listenOpenProjectInMain,
  listenProjectsChanged,
} from "@/services/window/projectManageBridge";
import { useOpenTabsStoreWithOut } from "@/store/modules/multipleTab";
import { useProjectStoreWithOut } from "@/store/modules/project";
import { useSettingsDrawerStore } from "@/store/modules/setting";
import { applyLocalMachineBootstrap } from "@/utils/localMachineBootstrap";
import { applyStartupTabsBootstrap } from "@/utils/startupTabsBootstrap";

/**
 * 主窗生命周期：冷启动标签、项目管理子窗桥、全局快捷键。
 * 不在这里拉 Git，避免壳层被仓库 IO 堵住。
 */
export function useAppLayout(): void {
  const router = useRouter();
  const route = useRoute();
  const settingsDrawerStore = useSettingsDrawerStore();
  const repositoryActive = computed(() => route.path.startsWith("/repo/"));

  function handleNewTab(): void {
    const tabId = useOpenTabsStoreWithOut().openNewTab();
    void router.push(`/tab/${tabId}`);
  }

  function handleOpenSettings(): void {
    settingsDrawerStore.openDrawer();
  }

  useShortcutAction("newTab", handleNewTab);
  useShortcutAction("openSettings", handleOpenSettings);
  useKeyboardShortcuts({ repositoryActive });

  onMounted(() => {
    let cancelled = false;
    void (async () => {
      await applyLocalMachineBootstrap();
      if (cancelled) {
        return;
      }
      await applyStartupTabsBootstrap((to, options) => {
        if (options?.replace) {
          void router.replace(to);
          return;
        }
        void router.push(to);
      });
    })();

    onUnmounted(() => {
      cancelled = true;
    });
  });

  onMounted(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

    void listenOpenProjectInMain((projectId) => {
      useOpenTabsStoreWithOut().openRepositoryTab(projectId);
      void router.push(`/repo/${projectId}`);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      cleanups.push(unlisten);
    });

    void listenProjectsChanged(() => {
      const projectStore = useProjectStoreWithOut();
      void Promise.all([
        projectStore.loadProjects(),
        projectStore.loadRecent(),
        projectStore.loadWorkspaces(),
      ]);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      cleanups.push(unlisten);
    });

    onUnmounted(() => {
      disposed = true;
      for (const cleanup of cleanups) {
        cleanup();
      }
    });
  });
}
