<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";

import { Menu, type MenuProps } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";

import CloneRepoPanel from "./components/CloneRepoPanel.vue";
import OpenRepoForm from "./components/OpenRepoForm.vue";
import ProjectGroupsTree from "./components/ProjectGroupsTree.vue";
import RecentProjectList from "./components/RecentProjectList.vue";

import { useOpenTabsStore, useOpenTabsStoreWithOut } from "@/store/modules/multipleTab";

import { parseNewTabLocationState } from "@/utils/newTabNavigation";
import { isStartupTabsApplied, onStartupTabsApplied } from "@/utils/startupTabsBootstrap";

defineOptions({ name: "DashboardPage" });

type DashboardView = "recent" | "open" | "clone" | "groups";

const props = withDefaults(
  defineProps<{
    active?: boolean;
  }>(),
  { active: true },
);

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const openTabsStore = useOpenTabsStore();
const { tabs } = storeToRefs(openTabsStore);
const startupReady = ref(isStartupTabsApplied());
const view = ref<DashboardView>("recent");

const nav = computed(() => [
  { id: "recent" as const, label: t("projectManager.recent"), icon: "History" },
  { id: "open" as const, label: t("projectManager.open"), icon: "FolderOpen" },
  { id: "clone" as const, label: t("projectManager.clone"), icon: "GitBranchPlus" },
  { id: "groups" as const, label: t("projectManager.groups"), icon: "FolderTree" },
]);

const menuItems = computed<MenuProps["items"]>(() =>
  nav.value.map((item) => ({
    key: item.id,
    label: item.label,
    icon: () => h(Icon, { name: item.icon, size: 16 }),
  })),
);

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
    const requested = parseNewTabLocationState(history.state);
    if (requested === "open" || requested === "clone") {
      view.value = requested;
      router.replace({ path: route.path, query: route.query });
    }
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
    router.replace(`/tab/${nextTabId}`);
  },
);

function handleOpenProject(projectId: string): void {
  useOpenTabsStoreWithOut().openRepositoryTab(projectId);
  router.push(`/repo/${projectId}`);
}

const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
  view.value = String(key) as DashboardView;
};
</script>

<template>
  <div class="flex h-full min-h-0">
    <Menu
      class="h-full w-48! shrink-0"
      mode="inline"
      :selected-keys="[view]"
      :items="menuItems"
      @click="handleMenuClick"
    />
    <div class="flex min-h-0 min-w-0 flex-1 flex-col p-6">
      <!-- 最近：最近打开的仓库列表 -->
      <RecentProjectList v-if="view === 'recent'" @open="handleOpenProject" />
      <!-- 打开：选择本地仓库路径并登记 -->
      <OpenRepoForm v-else-if="view === 'open'" @open="handleOpenProject" />
      <!-- 克隆：从远端 URL 克隆到本地 -->
      <CloneRepoPanel v-else-if="view === 'clone'" @open="handleOpenProject" />
      <!-- 仓库分组：分组树与组内仓库 -->
      <ProjectGroupsTree v-else-if="view === 'groups'" @open="handleOpenProject" />
    </div>
  </div>
</template>
