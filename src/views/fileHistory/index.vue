<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import { useI18n } from "vue-i18n";

import { AppLoadingScreen } from "@/components/Common";
import { FileHistoryWorkspace } from "@/components/Git";
import { readRouteQuery, useChildWindowProject } from "@/hooks/web/useChildWindowProject";

defineOptions({ name: "FileHistoryPage" });

const { t } = useI18n();
const route = useRoute();
const projectId = computed(() => readRouteQuery(route.query.projectId));
const filePath = computed(() => readRouteQuery(route.query.filePath));
const initialRef = computed(() => readRouteQuery(route.query.ref) || null);
const { project, loading, error } = useChildWindowProject(() => projectId.value, {
  notFound: "fileHistory.projectNotFound",
  loadFailed: "fileHistory.loadFailed",
});
</script>

<template>
  <AppLoadingScreen v-if="loading" />
  <main
    v-else-if="error || !project || !filePath"
    class="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm"
  >
    {{ error || t("fileHistory.projectNotFound") }}
  </main>
  <FileHistoryWorkspace v-else :project="project" :file-path="filePath" :initial-ref="initialRef" />
</template>
