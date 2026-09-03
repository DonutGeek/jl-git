<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { ProjectManager } from "@/components/Project";
import { useZustand } from "@/hooks/core/useZustand";
import { useOpenTabsStore, useOpenTabsStoreWithOut } from "@/store/modules/multipleTab";
import { useProjectStoreWithOut } from "@/store/modules/project";
import { toUserMessage } from "@/types/error";
import { parseNewTabLocationState } from "@/utils/newTabNavigation";
import { isStartupTabsApplied, onStartupTabsApplied } from "@/utils/startupTabsBootstrap";

defineOptions({ name: "DashboardPage" });

const props = withDefaults(
  defineProps<{
    active?: boolean;
  }>(),
  { active: true },
);

const router = useRouter();
const route = useRoute();
const tabs = useZustand(useOpenTabsStore, (state) => state.tabs);
const error = ref<string | null>(null);
const startupReady = ref(isStartupTabsApplied());
const requestedView = ref(parseNewTabLocationState(history.state));

const routeNewTabId = computed(() => {
  const match = route.path.match(/^\/tab\/([^/]+)/);
  return match?.[1] ?? null;
});
const isCurrentNewTab = computed(() =>
  Boolean(
    routeNewTabId.value &&
    tabs.value.some((tab) => tab.id === routeNewTabId.value && tab.type === "new-tab"),
  ),
);

onMounted(() => {
  onStartupTabsApplied(() => {
    startupReady.value = true;
  });
});

watch(
  () => route.fullPath,
  () => {
    requestedView.value = parseNewTabLocationState(history.state);
  },
);

watch(
  () => props.active,
  (active, _previous, onCleanup) => {
    if (!active) {
      return;
    }
    let mounted = true;
    void Promise.all([
      useProjectStoreWithOut().loadProjects(),
      useProjectStoreWithOut().loadRecent(),
      useProjectStoreWithOut().loadWorkspaces(),
    ])
      .then(() => {
        if (mounted) {
          error.value = null;
        }
      })
      .catch((loadError: unknown) => {
        if (mounted) {
          error.value = toUserMessage(loadError);
        }
      });
    onCleanup(() => {
      mounted = false;
    });
  },
  { immediate: true },
);

watch(
  () => [props.active, startupReady.value, isCurrentNewTab.value, tabs.value.length] as const,
  ([active, ready, currentNewTab, tabCount]) => {
    if (!active || !ready || currentNewTab || tabCount > 0) {
      return;
    }
    const nextTabId = useOpenTabsStoreWithOut().openNewTab();
    void router.replace(`/tab/${nextTabId}`);
  },
);

function handleOpenProject(projectId: string): void {
  useOpenTabsStoreWithOut().openRepositoryTab(projectId);
  void router.push(`/repo/${projectId}`);
}

function clearRequestedView(): void {
  requestedView.value = null;
  void router.replace({ path: route.path, query: route.query });
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <main class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6 pt-6">
      <p v-if="error" class="text-destructive mb-4 text-sm" role="alert">{{ error }}</p>
      <ProjectManager
        :requested-view="requestedView"
        @open="handleOpenProject"
        @requested-view-consumed="clearRequestedView"
      />
    </main>
  </div>
</template>
