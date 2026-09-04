import { computed, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";

import { useI18n } from "vue-i18n";

import { useHasAgentApiKey } from "@/hooks/core/useHasAgentApiKey";
import { useShortcutAction } from "@/hooks/core/useShortcutAction";
import { useMessage } from "@/hooks/web/useMessage";
import { useProjectStore, useProjectStoreWithOut } from "@/store/modules/project";
import { useRepoNavStore } from "@/store/modules/repoNav";
import {
  beginRepoSwitch,
  hasRepoSession,
  restoreRepoSession,
  restoreRepoSessionHistory,
  useRepoStore,
  useRepoStoreWithOut,
} from "@/store/modules/repo";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";
import type { RepoMainView } from "@/views/repo/utils/repoWorkspaceTypes";
import type { SidebarView } from "@/utils/activityBarOrder";
import { resolveRepoBootstrapMode, shouldShowRepoLoadingShell } from "@/utils/repoPageBootstrap";
import { finishRepoTabSwitchMeasure } from "@/utils/repoTabPerformance";

export interface RepoPageLoadError {
  projectId: string;
  message: string;
}

function lookupProject(projectId: string | undefined): Project | null {
  if (!projectId) {
    return null;
  }
  return useProjectStoreWithOut().findById(projectId) ?? null;
}

export function createRepoBootstrapStub(projectId: string): Project {
  const now = new Date(0).toISOString();
  return {
    id: projectId,
    workspaceId: null,
    name: "",
    description: null,
    icon: "",
    path: projectId,
    remoteUrl: null,
    lastOpenedAt: null,
    pinned: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function useRepoPage(projectId: () => string, active: () => boolean) {
  const { t } = useI18n();
  const message = useMessage();
  const projectStore = useProjectStore();
  const repoStore = useRepoStore();
  const { projects } = storeToRefs(projectStore);
  const { repoPath: activeRepoPath, conflictFocusEpoch } = storeToRefs(repoStore);
  const project = computed(() => projects.value.find((item) => item.id === projectId()) ?? null);
  const { fileTreeReveal, workspacePreview } = storeToRefs(useRepoNavStore());
  const hasApiKey = useHasAgentApiKey();

  const initialProject = lookupProject(projectId());
  const readyRepoPath = ref<string | null>(
    initialProject &&
      useRepoStoreWithOut().repoPath === initialProject.path &&
      hasRepoSession(initialProject.path)
      ? initialProject.path
      : null,
  );
  const loadError = ref<RepoPageLoadError | null>(null);
  const bootstrapEpoch = ref(0);
  const sidebarView = ref<SidebarView>("branches");
  const mainView = ref<RepoMainView>("changes");

  const error = computed(() =>
    loadError.value?.projectId === projectId() ? loadError.value.message : null,
  );
  const bootstrapping = computed(() =>
    project.value
      ? shouldShowRepoLoadingShell({
          targetPath: project.value.path,
          activeStorePath: activeRepoPath.value,
          readyRepoPath: readyRepoPath.value,
        })
      : !error.value,
  );

  useShortcutAction("workspace", () => {
    if (!active() || !project.value || bootstrapping.value) {
      return;
    }
    mainView.value = "workspace";
  });
  useShortcutAction("changes", () => {
    if (!active() || !project.value || bootstrapping.value) {
      return;
    }
    mainView.value = "changes";
  });
  useShortcutAction("history", () => {
    if (!active() || !project.value || bootstrapping.value) {
      return;
    }
    mainView.value = "history";
  });

  watch(hasApiKey, (key) => {
    if (!key && sidebarView.value === "agent") {
      sidebarView.value = "branches";
    }
  });

  watch(fileTreeReveal, (reveal) => {
    if (reveal) {
      sidebarView.value = "files";
    }
  });

  watch(workspacePreview, (preview) => {
    if (preview) {
      mainView.value = "workspace";
    }
  });

  watch(conflictFocusEpoch, (epoch) => {
    if (epoch > 0 && active()) {
      mainView.value = "changes";
    }
  });

  watch(
    () => [active(), sidebarView.value, bootstrapping.value, project.value?.path] as const,
    ([isActive, view, boot, path], previous) => {
      if (!isActive || boot || !path) {
        return;
      }
      const prevView = previous?.[1];
      if (prevView === undefined || prevView === view) {
        return;
      }
      if (view === "branches") {
        void useRepoStoreWithOut()
          .refreshBranches()
          .catch((refreshError: unknown) => {
            console.warn("[RepoPage] refreshBranches on sidebar switch failed", refreshError);
          });
      }
      if (view === "tags") {
        void useRepoStoreWithOut()
          .refreshTags()
          .catch((refreshError: unknown) => {
            console.warn("[RepoPage] refreshTags on sidebar switch failed", refreshError);
          });
      }
    },
  );

  watch(
    () => [active(), projectId(), bootstrapEpoch.value] as const,
    ([isActive, id], _previous, onCleanup) => {
      if (!isActive || !id) {
        return;
      }
      let cancelled = false;
      let hydrationFrame: number | null = null;
      let historyFrame: number | null = null;
      const shellFrame = window.requestAnimationFrame(() => {
        hydrationFrame = window.requestAnimationFrame(() => {
          const metric = finishRepoTabSwitchMeasure(id);
          if (metric && import.meta.env.DEV) {
            console.debug(
              `[performance] repo tab shell painted in ${metric.durationMs.toFixed(1)}ms`,
            );
          }
          void (async () => {
            loadError.value = null;
            try {
              let target = useProjectStoreWithOut().findById(id);
              if (!target) {
                await useProjectStoreWithOut().loadProjects();
                target = useProjectStoreWithOut().findById(id);
              }
              if (!target) {
                throw new Error(t("repo.notFound"));
              }
              if (cancelled) {
                return;
              }

              const cacheHit = hasRepoSession(target.path);
              const mode = resolveRepoBootstrapMode({
                targetPath: target.path,
                activeStorePath: useRepoStoreWithOut().repoPath,
                hasCachedSession: cacheHit,
              });

              if (mode === "restore-cache") {
                restoreRepoSession(target.path, {
                  deferHistory: mainView.value !== "history",
                });
              } else if (mode === "load") {
                beginRepoSwitch(target.path, true);
              }

              void useProjectStoreWithOut()
                .openExisting(target.id)
                .catch((touchError) => {
                  console.warn("[RepoPage] touchOpened failed", touchError);
                });

              if (mode === "load") {
                await useRepoStoreWithOut().loadAll(target.path);
                if (!cancelled) {
                  readyRepoPath.value = target.path;
                }
                return;
              }

              readyRepoPath.value = target.path;
              if (mode === "restore-cache" && mainView.value !== "history") {
                const restoredPath = target.path;
                historyFrame = window.requestAnimationFrame(() => {
                  restoreRepoSessionHistory(restoredPath);
                });
              }
              const hydrated = useRepoStoreWithOut();
              const canSoftRefresh =
                hydrated.repoPath === target.path && hydrated.branches.length > 0;
              if (canSoftRefresh) {
                void useRepoStoreWithOut()
                  .refreshStatus()
                  .catch((refreshError) => {
                    console.warn("[RepoPage] refreshStatus failed", refreshError);
                  });
                return;
              }
              await useRepoStoreWithOut().loadAll(target.path);
            } catch (initError) {
              if (!cancelled) {
                const next = toUserMessage(initError);
                loadError.value = { projectId: id, message: next };
                message.error(initError);
              }
            }
          })();
        });
      });

      onCleanup(() => {
        cancelled = true;
        window.cancelAnimationFrame(shellFrame);
        if (hydrationFrame !== null) {
          window.cancelAnimationFrame(hydrationFrame);
        }
        if (historyFrame !== null) {
          window.cancelAnimationFrame(historyFrame);
        }
      });
    },
    { immediate: true },
  );

  watch(
    () => [active(), bootstrapping.value, project.value?.path] as const,
    ([isActive, boot, path], _previous, onCleanup) => {
      if (!isActive || boot || !path) {
        return;
      }
      let refreshing = false;
      let refreshFrame: number | null = null;
      const refreshChanges = async (): Promise<void> => {
        if (refreshing) {
          return;
        }
        refreshing = true;
        try {
          await useRepoStoreWithOut().refreshStatus();
        } catch (refreshError) {
          console.warn("[RepoPage] refresh repository status failed", refreshError);
        } finally {
          refreshing = false;
        }
      };
      const scheduleRefresh = (): void => {
        if (refreshFrame !== null || document.visibilityState !== "visible") {
          return;
        }
        refreshFrame = window.requestAnimationFrame(() => {
          refreshFrame = window.requestAnimationFrame(() => {
            refreshFrame = null;
            void refreshChanges();
          });
        });
      };
      const handleWindowFocus = (): void => {
        scheduleRefresh();
      };
      const handleVisibilityChange = (): void => {
        if (document.visibilityState === "visible") {
          scheduleRefresh();
        }
      };
      window.addEventListener("focus", handleWindowFocus);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      onCleanup(() => {
        if (refreshFrame !== null) {
          window.cancelAnimationFrame(refreshFrame);
        }
        window.removeEventListener("focus", handleWindowFocus);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      });
    },
    { immediate: true },
  );

  onUnmounted(() => {
    useRepoStoreWithOut().reset();
  });

  function retryBootstrap(): void {
    loadError.value = null;
    bootstrapEpoch.value += 1;
  }

  return {
    project,
    error,
    bootstrapping,
    sidebarView,
    mainView,
    hasApiKey,
    retryBootstrap,
  };
}
