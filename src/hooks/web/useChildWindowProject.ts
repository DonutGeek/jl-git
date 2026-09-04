import { ref, watch } from "vue";

import { useI18n } from "vue-i18n";

import { listProjects } from "@/api/project";
import { useProjectStoreWithOut } from "@/store/modules/project";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";

/** 读取路由 query 的单个字符串参数 */
export function readRouteQuery(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }
  return "";
}

/** 子窗按 projectId 加载项目；独立 Webview 可灌入 Zustand 供历史等查找 */
export function useChildWindowProject(
  projectId: () => string,
  messages: { notFound: string; loadFailed: string },
  options?: { hydrateStore?: boolean },
) {
  const { t } = useI18n();
  const project = ref<Project | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);

  watch(
    projectId,
    (id, _previous, onCleanup) => {
      if (!id) {
        loading.value = false;
        error.value = t(messages.notFound);
        project.value = null;
        return;
      }
      let active = true;
      loading.value = true;
      error.value = null;
      listProjects()
        .then((projects) => {
          const next = projects.find((item) => item.id === id);
          if (!next) {
            throw new Error(t(messages.notFound));
          }
          if (!active) {
            return;
          }
          if (options?.hydrateStore) {
            useProjectStoreWithOut().$patch({ projects, current: next });
          }
          project.value = next;
        })
        .catch((reason: unknown) => {
          if (active) {
            error.value = toUserMessage(reason) || t(messages.loadFailed);
            project.value = null;
          }
        })
        .finally(() => {
          if (active) {
            loading.value = false;
          }
        });
      onCleanup(() => {
        active = false;
      });
    },
    { immediate: true },
  );

  return { project, loading, error };
}
