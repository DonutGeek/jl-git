<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { useI18n } from "vue-i18n";

import { AppLoadingScreen } from "@/components/Common";
import { BranchCompareWorkspace } from "@/components/Git";
import { readRouteQuery, useChildWindowProject } from "@/hooks/web/useChildWindowProject";
import { listBranches } from "@/services/git";
import { toUserMessage } from "@/types/error";
import type { BranchCompareMode, GitBranch } from "@/types/git";

defineOptions({ name: "BranchComparePage" });

const { t } = useI18n();
const route = useRoute();
const projectId = computed(() => readRouteQuery(route.query.projectId));
const mode = computed<BranchCompareMode>(() =>
  readRouteQuery(route.query.mode) === "localUpstream" ? "localUpstream" : "branch",
);
const base = computed(() => readRouteQuery(route.query.base));
const target = computed(() => readRouteQuery(route.query.target));
const { project, loading, error } = useChildWindowProject(() => projectId.value, {
  notFound: "branchCompare.projectNotFound",
  loadFailed: "branchCompare.loadFailed",
});

const branches = ref<GitBranch[]>([]);
const branchesError = ref<string | null>(null);
const branchesLoading = ref(false);

watch(
  project,
  (next, _previous, onCleanup) => {
    if (!next) {
      branches.value = [];
      return;
    }
    let active = true;
    branchesLoading.value = true;
    branchesError.value = null;
    void listBranches(next.path, true)
      .then((result) => {
        if (active) {
          branches.value = result;
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          branchesError.value = toUserMessage(reason) || t("branchCompare.loadFailed");
          branches.value = [];
        }
      })
      .finally(() => {
        if (active) {
          branchesLoading.value = false;
        }
      });
    onCleanup(() => {
      active = false;
    });
  },
  { immediate: true },
);
</script>

<template>
  <AppLoadingScreen v-if="loading || branchesLoading" />
  <main
    v-else-if="error || branchesError || !project"
    class="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm"
  >
    {{ error || branchesError || t("branchCompare.projectNotFound") }}
  </main>
  <BranchCompareWorkspace
    v-else
    :project="project"
    :branches="branches"
    :initial-mode="mode"
    :initial-base="base"
    :initial-target="target"
  />
</template>
