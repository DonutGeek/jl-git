<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import { useI18n } from "vue-i18n";

import { AppLoadingScreen } from "@/components/Common";
import { BranchHistoryWorkspace } from "@/components/Git";
import { readRouteQuery, useChildWindowProject } from "@/hooks/web/useChildWindowProject";

defineOptions({ name: "CommitHistoryPage" });

const { t } = useI18n();
const route = useRoute();
const projectId = computed(() => readRouteQuery(route.query.projectId));
const commitId = computed(() => readRouteQuery(route.query.commitId));
const { project, loading, error } = useChildWindowProject(
  () => projectId.value,
  { notFound: "commitHistory.projectNotFound", loadFailed: "commitHistory.loadFailed" },
  { hydrateStore: true },
);
</script>

<template>
  <AppLoadingScreen v-if="loading" />
  <main
    v-else-if="error || !project || !commitId"
    class="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm"
  >
    {{ error || t("commitHistory.projectNotFound") }}
  </main>
  <BranchHistoryWorkspace
    v-else
    :project="project"
    :initial-ref="commitId"
    :initial-commit-id="commitId"
    :window-title="t('commitHistory.windowTitle', { shortId: commitId.slice(0, 7) })"
  />
</template>
