<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import { useI18n } from "vue-i18n";

import { AppLoadingScreen } from "@/components/Common";
import { BranchManageWorkspace } from "@/components/Git";
import { readRouteQuery, useChildWindowProject } from "@/hooks/web/useChildWindowProject";

defineOptions({ name: "BranchManagePage" });

const { t } = useI18n();
const route = useRoute();
const projectId = computed(() => readRouteQuery(route.query.projectId));
const { project, loading, error } = useChildWindowProject(
  () => projectId.value,
  { notFound: "branchManage.projectNotFound", loadFailed: "branchManage.loadFailed" },
  { hydrateStore: true },
);
</script>

<template>
  <AppLoadingScreen v-if="loading" />
  <main
    v-else-if="error || !project"
    class="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm"
  >
    {{ error || t("branchManage.projectNotFound") }}
  </main>
  <BranchManageWorkspace v-else :project="project" />
</template>
