<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import { useI18n } from "vue-i18n";

import { AppLoadingScreen } from "@/components/Common";
import { BranchHistoryWorkspace } from "@/components/Git";
import { readRouteQuery, useChildWindowProject } from "@/hooks/web/useChildWindowProject";

defineOptions({ name: "BranchHistoryPage" });

const { t } = useI18n();
const route = useRoute();
const projectId = computed(() => readRouteQuery(route.query.projectId));
const initialRef = computed(() => readRouteQuery(route.query.ref) || null);
const { project, loading, error } = useChildWindowProject(
  () => projectId.value,
  { notFound: "branchHistory.projectNotFound", loadFailed: "branchHistory.loadFailed" },
  { hydrateStore: true },
);
</script>

<template>
  <AppLoadingScreen v-if="loading" />
  <main
    v-else-if="error || !project"
    class="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm"
  >
    {{ error || t("branchHistory.projectNotFound") }}
  </main>
  <BranchHistoryWorkspace v-else :project="project" :initial-ref="initialRef" />
</template>
