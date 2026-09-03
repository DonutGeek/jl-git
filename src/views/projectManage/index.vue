<script setup lang="ts">
import { onMounted, ref } from "vue";

import { useI18n } from "vue-i18n";

import { AppLoadingScreen } from "@/components/Common";
import { ProjectManagePanel } from "@/components/Project";
import {
  notifyProjectsChanged,
  requestOpenProjectInMain,
} from "@/services/window/projectManageBridge";
import { useProjectStoreWithOut } from "@/store/modules/project";
import { toUserMessage } from "@/types/error";

defineOptions({ name: "ProjectManagePage" });

const { t } = useI18n();
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(() => {
  let active = true;
  void Promise.all([
    useProjectStoreWithOut().loadProjects(),
    useProjectStoreWithOut().loadRecent(),
    useProjectStoreWithOut().loadWorkspaces(),
  ])
    .then(() => {
      if (active) {
        error.value = null;
      }
    })
    .catch((reason: unknown) => {
      if (active) {
        error.value = toUserMessage(reason) || t("projectManager.manageLoadFailed");
      }
    })
    .finally(() => {
      if (active) {
        loading.value = false;
      }
    });
});

async function handleOpenProject(projectId: string): Promise<void> {
  try {
    await requestOpenProjectInMain(projectId);
  } catch (reason: unknown) {
    error.value = toUserMessage(reason) || t("projectManager.manageOpenFailed");
  }
}

async function handleProjectsMutated(): Promise<void> {
  try {
    await notifyProjectsChanged();
  } catch {
    // 主窗未开监听时忽略
  }
}
</script>

<template>
  <AppLoadingScreen v-if="loading" />
  <div v-else class="flex h-full flex-col overflow-hidden">
    <main class="flex min-h-0 flex-1 flex-col px-3 py-2">
      <p v-if="error" class="text-destructive mb-2 shrink-0 text-sm" role="alert">{{ error }}</p>
      <ProjectManagePanel
        @open="(id) => void handleOpenProject(id)"
        @mutated="void handleProjectsMutated()"
      />
    </main>
  </div>
</template>
