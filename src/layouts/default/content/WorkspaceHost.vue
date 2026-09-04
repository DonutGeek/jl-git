<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";

import { cn } from "@/lib/utils";
import { useOpenTabsStore } from "@/store/modules/multipleTab";
import { resolveActiveOpenTab, shouldClearPendingActivation } from "@/utils/repoTabActivation";

import DashboardPage from "@/views/dashboard/index.vue";
import RepoPage from "@/views/repo/index.vue";

defineOptions({ name: "WorkspaceHost" });

const route = useRoute();
const openTabsStore = useOpenTabsStore();
const { tabs, pendingActiveId, pendingOriginLocationKey } = storeToRefs(openTabsStore);

const pendingActivationStale = computed(() =>
  shouldClearPendingActivation({
    pendingActiveId: pendingActiveId.value,
    originLocationKey: pendingOriginLocationKey.value,
    currentLocationKey: route.fullPath,
  }),
);

const activeTab = computed(() =>
  resolveActiveOpenTab(
    route.path,
    tabs.value,
    pendingActivationStale.value ? null : pendingActiveId.value,
  ),
);

const activeRepoId = computed(() =>
  activeTab.value?.type === "repository" ? activeTab.value.projectId : null,
);

const showDashboard = computed(
  () =>
    activeTab.value?.type === "new-tab" ||
    (!activeTab.value && (route.path === "/" || route.path.startsWith("/tab/"))),
);

const hasNewTab = computed(() => tabs.value.some((tab) => tab.type === "new-tab"));
const openRepoIdsKey = computed(() =>
  tabs.value
    .filter((tab) => tab.type === "repository")
    .map((tab) => (tab.type === "repository" ? tab.projectId : ""))
    .join("|"),
);

const mountedRepoId = ref<string | null>(activeRepoId.value);

watch(
  [activeRepoId, openRepoIdsKey],
  ([repoId, openIds]) => {
    if (repoId) {
      mountedRepoId.value = repoId;
      return;
    }
    if (!openIds) {
      mountedRepoId.value = null;
    }
  },
  { immediate: true },
);

const repoProjectId = computed(() => activeRepoId.value ?? mountedRepoId.value);
const repoVisible = computed(() => Boolean(activeRepoId.value));
</script>

<template>
  <div class="h-full">
    <div v-if="showDashboard || hasNewTab" :class="cn('h-full', !showDashboard && 'hidden')">
      <DashboardPage :active="showDashboard" />
    </div>
    <div
      v-if="repoProjectId"
      :class="cn('h-full', !repoVisible && 'hidden')"
      :aria-hidden="!repoVisible"
    >
      <RepoPage :project-id="repoProjectId" :active="repoVisible" />
    </div>
  </div>
</template>
