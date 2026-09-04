<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";

import { Button, Form, FormItem, Input, Modal, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { MultiAgentWindowButton } from "@/components/Agent";
import RepoTabItem from "./RepoTabItem.vue";
import { ScrollArea } from "@/components/ScrollArea";
import {
  REPO_TAB_CONTENT_CLASSNAME,
  REPO_TAB_SCROLL_AREA_CLASSNAME,
  REPO_TAB_SCROLL_FADE_PX,
  resolveRepoTabWheelDelta,
  scrollHorizontallyIntoView,
} from "./repoLoadingLayout";
import { useWindowChromeLayout } from "@/hooks/core/useWindowChromeLayout";
import { useForm } from "@/hooks/web/useForm";
import { useMessage } from "@/hooks/web/useMessage";
import { cn } from "@/lib/utils";
import { gitService } from "@/api/git";
import { pickPrimaryRemoteUrl } from "@/api/git/remote";
import { useOpenTabsStore, useOpenTabsStoreWithOut } from "@/store/modules/multipleTab";
import { useProjectStore, useProjectStoreWithOut } from "@/store/modules/project";
import type { Project } from "@/types/project";
import { copyToClipboard } from "@/utils/clipboard";
import {
  resolveActiveOpenTab,
  resolveRoutedTabId,
  shouldClearPendingActivation,
} from "@/utils/repoTabActivation";
import { beginRepoTabSwitchMeasure } from "@/utils/repoTabPerformance";
import { groupRepoTabs } from "@/utils/repoTabGroups";

import type { TabDisplayItem } from "./repoTabTypes";

defineOptions({ name: "RepoTabBar" });

const { t } = useI18n();
const message = useMessage();
const router = useRouter();
const route = useRoute();
const { headerPaddingClass, isMacOverlay } = useWindowChromeLayout();

const openTabsStore = useOpenTabsStore();
const { tabs: tabEntries, pendingActiveId, pendingOriginLocationKey } = storeToRefs(openTabsStore);
const projectStore = useProjectStore();
const { projects, workspaces } = storeToRefs(projectStore);

const optimisticActiveId = ref<string | null>(null);
const canScrollTabsLeft = ref(false);
const canScrollTabsRight = ref(false);
const aliasTarget = ref<Project | null>(null);
const aliasBusy = ref(false);
const {
  form: aliasForm,
  formInst: aliasFormInst,
  rules: aliasRules,
  resetForm: resetAliasForm,
  validate: validateAlias,
} = useForm(
  () => ({ name: "" }),
  () => ({
    name: [{ required: true, whitespace: true, message: () => t("repo.tabAliasRequired") }],
  }),
);
const scrollArea = ref<{ viewport: HTMLElement | null } | null>(null);

const noDragStyle = { WebkitAppRegion: "no-drag" } as Record<string, string>;
const dragProps = computed(() =>
  isMacOverlay.value ? ({ "data-tauri-drag-region": true } as const) : {},
);

const pendingActivationStale = computed(() =>
  shouldClearPendingActivation({
    pendingActiveId: pendingActiveId.value,
    originLocationKey: pendingOriginLocationKey.value,
    currentLocationKey: route.fullPath,
  }),
);
const effectivePendingActiveId = computed(() =>
  pendingActivationStale.value ? null : pendingActiveId.value,
);
const routedActiveId = computed(() => resolveRoutedTabId(route.path, tabEntries.value));
const resolvedActiveId = computed(
  () =>
    resolveActiveOpenTab(route.path, tabEntries.value, effectivePendingActiveId.value)?.id ?? null,
);
const activeId = computed(() => optimisticActiveId.value ?? resolvedActiveId.value);

const labels = computed(() => ({
  close: t("repo.tabClose"),
  remove: t("repo.tabRemove"),
  closeMore: t("repo.tabCloseMore"),
  closeOthers: t("repo.tabCloseOthers"),
  closeLeft: t("repo.tabCloseLeft"),
  closeRight: t("repo.tabCloseRight"),
  setAlias: t("repo.tabSetAlias"),
  copy: t("common.copy"),
  copyRemote: t("repo.tabCopyRemote"),
  copyPath: t("repo.tabCopyPath"),
}));

const tabs = computed((): TabDisplayItem[] => {
  const byId = new Map(projects.value.map((project) => [project.id, project]));
  return tabEntries.value.flatMap((tab): TabDisplayItem[] => {
    if (tab.type === "new-tab") {
      return [
        {
          id: tab.id,
          label: t("repo.newTab"),
          title: t("repo.newTab"),
          type: tab.type,
          workspaceId: undefined,
        },
      ];
    }
    const project = byId.get(tab.projectId);
    return project
      ? [
          {
            id: tab.id,
            label: project.name,
            title: project.path,
            type: tab.type,
            workspaceId: project.workspaceId,
            project,
          },
        ]
      : [];
  });
});

const workspaceById = computed(
  () => new Map(workspaces.value.map((workspace) => [workspace.id, workspace])),
);

const tabGroups = computed(() => {
  const groups = groupRepoTabs(
    tabs.value.map((tab) => ({
      workspaceId: tab.workspaceId,
      value: tab,
    })),
  );
  const workspaceRank = new Map(
    [...workspaces.value]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"),
      )
      .map((workspace, index) => [workspace.id, index]),
  );
  return groups.sort((left, right) => {
    if (left.workspaceId === undefined) {
      return 1;
    }
    if (right.workspaceId === undefined) {
      return -1;
    }
    if (left.workspaceId === null) {
      return 1;
    }
    if (right.workspaceId === null) {
      return -1;
    }
    return (
      (workspaceRank.get(left.workspaceId) ?? Number.MAX_SAFE_INTEGER) -
      (workspaceRank.get(right.workspaceId) ?? Number.MAX_SAFE_INTEGER)
    );
  });
});

const orderedTabIds = computed(() =>
  tabGroups.value.flatMap((group) => group.values.map((tab) => tab.id)),
);

onMounted(() => {
  const projectStore = useProjectStoreWithOut();
  const tasks: Promise<unknown>[] = [];
  if (projects.value.length === 0) {
    tasks.push(projectStore.loadProjects());
  }
  if (workspaces.value.length === 0) {
    tasks.push(projectStore.loadWorkspaces());
  }
  if (tasks.length > 0) {
    void Promise.all(tasks).catch((error: unknown) => {
      console.warn("[RepoTabBar] load project groups failed", error);
    });
  }
});

watch([projects, tabEntries], ([projectList, entries]) => {
  if (projectList.length === 0) {
    return;
  }
  const valid = new Set(projectList.map((project) => project.id));
  if (entries.some((tab) => tab.type === "repository" && !valid.has(tab.projectId))) {
    useOpenTabsStoreWithOut().pruneTabs(valid);
  }
});

watch([activeId, tabEntries, () => route.path], ([id, entries, path]) => {
  if (id && path.startsWith("/repo/") && !entries.some((tab) => tab.id === id)) {
    useOpenTabsStoreWithOut().openRepositoryTab(id);
  }
});

watch([pendingActiveId, routedActiveId, pendingActivationStale], ([pending, routed, stale]) => {
  if ((pending && routed === pending) || stale) {
    useOpenTabsStoreWithOut().setPendingActiveId(null);
  }
});

watch([optimisticActiveId, routedActiveId, tabEntries], ([optimistic, routed, entries]) => {
  if (optimistic && (routed === optimistic || !entries.some((tab) => tab.id === optimistic))) {
    optimisticActiveId.value = null;
  }
});

watch([activeId, tabEntries, () => route.path], ([id, entries, path]) => {
  if (path === "/" || !id || !entries.some((tab) => tab.id === id)) {
    return;
  }
  useOpenTabsStoreWithOut().setLastActiveTabId(id);
});

watch(orderedTabIds, (ids) => {
  useOpenTabsStoreWithOut().orderTabs(ids);
});

watch([activeId, tabEntries], async ([id]) => {
  const viewport = scrollArea.value?.viewport;
  if (!id || !viewport) {
    return;
  }
  await nextTick();
  const activeEl = viewport.querySelector<HTMLElement>(`[data-repo-tab-id="${CSS.escape(id)}"]`);
  if (activeEl) {
    scrollHorizontallyIntoView(viewport, activeEl, REPO_TAB_SCROLL_FADE_PX);
  }
});

watch(
  () => scrollArea.value?.viewport,
  (viewport, _previous, onCleanup) => {
    if (!viewport) {
      canScrollTabsLeft.value = false;
      canScrollTabsRight.value = false;
      return;
    }

    const updateScrollEdges = (): void => {
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      canScrollTabsLeft.value = viewport.scrollLeft > 1;
      canScrollTabsRight.value = viewport.scrollLeft < maxScrollLeft - 1;
    };

    const handleWheel = (event: WheelEvent): void => {
      const delta = resolveRepoTabWheelDelta({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        hasOverflow: viewport.scrollWidth > viewport.clientWidth,
      });
      if (delta === 0) {
        return;
      }
      const previous = viewport.scrollLeft;
      viewport.scrollLeft += delta;
      if (viewport.scrollLeft !== previous) {
        event.preventDefault();
      }
    };

    const content = viewport.firstElementChild;
    const resizeObserver = new ResizeObserver(updateScrollEdges);
    resizeObserver.observe(viewport);
    if (content instanceof HTMLElement) {
      resizeObserver.observe(content);
    }
    viewport.addEventListener("scroll", updateScrollEdges, { passive: true });
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    updateScrollEdges();

    onCleanup(() => {
      resizeObserver.disconnect();
      viewport.removeEventListener("scroll", updateScrollEdges);
      viewport.removeEventListener("wheel", handleWheel);
    });
  },
);

function navigateToTab(tabId: string): void {
  const target = useOpenTabsStoreWithOut().tabs.find((tab) => tab.id === tabId);
  if (!target) {
    return;
  }
  if (target.type === "repository") {
    void router.push(`/repo/${target.projectId}`);
    return;
  }
  void router.push(`/tab/${target.id}`);
}

function activateTab(tabId: string): void {
  const target = useOpenTabsStoreWithOut().tabs.find((tab) => tab.id === tabId);
  if (target?.type === "repository") {
    beginRepoTabSwitchMeasure(target.projectId);
  }
  optimisticActiveId.value = tabId;
  useOpenTabsStoreWithOut().setPendingActiveId(tabId, route.fullPath);
  navigateToTab(tabId);
}

function syncRouteAfterTabsChange(preferredId?: string): void {
  const remaining = useOpenTabsStoreWithOut().tabs;
  if (activeId.value && remaining.some((tab) => tab.id === activeId.value)) {
    return;
  }
  const next = remaining.find((tab) => tab.id === preferredId) ?? remaining[0];
  if (next) {
    activateTab(next.id);
    return;
  }
  activateTab(useOpenTabsStoreWithOut().openNewTab());
}

function handleSelect(tabId: string): void {
  if (tabId === activeId.value) {
    return;
  }
  activateTab(tabId);
}

function closeOneTab(tabId: string): void {
  const nextId = useOpenTabsStoreWithOut().closeTab(tabId);
  if (tabId !== activeId.value) {
    return;
  }
  if (nextId) {
    activateTab(nextId);
    return;
  }
  activateTab(useOpenTabsStoreWithOut().openNewTab());
}

async function handleRemove(project: Project): Promise<void> {
  try {
    await useProjectStoreWithOut().removeProject(project.id);
    useOpenTabsStoreWithOut().closeTab(project.id);
    syncRouteAfterTabsChange();
    message.success(t("repo.tabRemoveSuccess", { name: project.name }));
  } catch (error) {
    message.error(error);
  }
}

async function submitAlias(): Promise<void> {
  if (!aliasTarget.value) {
    return;
  }
  if (!(await validateAlias())) {
    return Promise.reject();
  }
  const next = aliasForm.name.trim();
  if (next === aliasTarget.value.name) {
    aliasTarget.value = null;
    return;
  }
  aliasBusy.value = true;
  try {
    await useProjectStoreWithOut().updateAlias(aliasTarget.value.id, next);
    message.success(t("repo.tabAliasSuccess", { name: next }));
    aliasTarget.value = null;
  } catch (error) {
    message.error(error);
  } finally {
    aliasBusy.value = false;
  }
}

function openAliasDialog(project: Project): void {
  aliasTarget.value = project;
  resetAliasForm({ name: project.name });
}

function closeAliasDialog(): void {
  if (!aliasBusy.value) {
    aliasTarget.value = null;
  }
}

async function handleCopyRemote(project: Project): Promise<void> {
  try {
    const url = pickPrimaryRemoteUrl(await gitService.listRemotes(project.path));
    if (!url) {
      message.info(t("repo.tabCopyRemoteEmpty"));
      return;
    }
    await copyToClipboard(url);
    message.success(t("repo.tabCopyRemoteSuccess"));
  } catch (error) {
    message.error(error);
  }
}

async function handleCopyPath(project: Project): Promise<void> {
  try {
    await copyToClipboard(project.path);
    message.success(t("repo.tabCopyPathSuccess"));
  } catch (error) {
    message.error(error);
  }
}

function handleAddTab(): void {
  activateTab(useOpenTabsStoreWithOut().openNewTab());
}
</script>

<template>
  <header
    v-bind="dragProps"
    :class="
      cn(
        'bg-muted/40 relative isolate flex h-12 shrink-0 items-center overflow-hidden pr-0',
        'after:bg-border after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-20 after:h-px after:content-[\'\']',
        headerPaddingClass,
        'z-40',
      )
    "
  >
    <div class="mr-2 flex h-7 shrink-0 items-center" :style="noDragStyle">
      <Tooltip :title="t('repo.addTab')">
        <Button
          type="text"
          size="small"
          class="text-muted-foreground hover:text-foreground size-7 shrink-0"
          @click="handleAddTab"
        >
          <template #icon>
            <Icon name="Plus" :size="14" />
          </template>
        </Button>
      </Tooltip>
    </div>
    <div class="flex h-full min-w-0 flex-1 items-center">
      <div v-bind="dragProps" class="relative h-full min-w-0 flex-1 pb-px">
        <ScrollArea
          ref="scrollArea"
          orientation="horizontal"
          :class="REPO_TAB_SCROLL_AREA_CLASSNAME"
        >
          <div :class="REPO_TAB_CONTENT_CLASSNAME" :style="noDragStyle">
            <div
              v-for="group in tabGroups"
              :key="group.key"
              class="flex h-full items-center gap-1.5"
            >
              <span
                v-if="typeof group.workspaceId === 'string'"
                class="text-muted-foreground max-w-20 truncate text-[10px] font-medium"
              >
                {{ workspaceById.get(group.workspaceId)?.name }}
              </span>
              <RepoTabItem
                v-for="tab in group.values"
                :key="tab.id"
                :tab="tab"
                :is-active="tab.id === activeId"
                :tab-index="orderedTabIds.indexOf(tab.id)"
                :tab-count="tabs.length"
                :close-label="t('repo.closeTab', { name: tab.label })"
                :labels="labels"
                @select="handleSelect"
                @close="closeOneTab"
                @close-others="
                  (id) => {
                    useOpenTabsStoreWithOut().closeOtherTabs(id);
                    syncRouteAfterTabsChange(id);
                  }
                "
                @close-left="
                  (id) => {
                    useOpenTabsStoreWithOut().closeTabsToLeft(id);
                    syncRouteAfterTabsChange(id);
                  }
                "
                @close-right="
                  (id) => {
                    useOpenTabsStoreWithOut().closeTabsToRight(id);
                    syncRouteAfterTabsChange(id);
                  }
                "
                @remove="(project) => void handleRemove(project)"
                @set-alias="openAliasDialog"
                @copy-remote="(project) => void handleCopyRemote(project)"
                @copy-path="(project) => void handleCopyPath(project)"
              />
            </div>
          </div>
        </ScrollArea>
        <div
          :class="
            cn(
              'pointer-events-none absolute top-0 bottom-px left-0 z-10 w-10 bg-linear-to-r from-[color-mix(in_oklab,var(--muted)_40%,var(--background))] from-15% to-transparent transition-opacity duration-150',
              canScrollTabsLeft ? 'opacity-100' : 'opacity-0',
            )
          "
          aria-hidden="true"
        />
        <div
          :class="
            cn(
              'pointer-events-none absolute top-0 right-0 bottom-px z-10 w-10 bg-linear-to-l from-[color-mix(in_oklab,var(--muted)_40%,var(--background))] from-15% to-transparent transition-opacity duration-150',
              canScrollTabsRight ? 'opacity-100' : 'opacity-0',
            )
          "
          aria-hidden="true"
        />
      </div>
    </div>
    <div v-bind="dragProps" class="h-full w-1.5 shrink-0" />
    <div class="flex h-7 shrink-0 items-center pr-2" :style="noDragStyle">
      <MultiAgentWindowButton
        :label="t('multiAgent.openButton')"
        class="size-7 shrink-0"
        icon-class-name="size-4"
        tooltip-side="bottom"
      />
    </div>
  </header>

  <Modal
    :open="Boolean(aliasTarget)"
    :title="t('repo.tabAliasTitle')"
    :confirm-loading="aliasBusy"
    :ok-text="t('repo.tabAliasSave')"
    :cancel-text="t('common.cancel')"
    @ok="submitAlias"
    @cancel="closeAliasDialog"
  >
    <Form :ref="aliasFormInst" :model="aliasForm" :rules="aliasRules" layout="vertical">
      <FormItem name="name" required>
        <Input
          v-model:value="aliasForm.name"
          :placeholder="t('openRepo.aliasPlaceholder')"
          :disabled="aliasBusy"
          @press-enter="submitAlias"
        />
      </FormItem>
    </Form>
  </Modal>
</template>
