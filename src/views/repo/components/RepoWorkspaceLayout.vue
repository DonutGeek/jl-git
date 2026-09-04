<script setup lang="ts">
import ActivityBar from "./ActivityBar.vue";
import RepoToolbar from "./RepoToolbar.vue";
import ResizableSplit from "@/layouts/default/components/ResizableSplit.vue";
import type { RepoMainView } from "../utils/repoWorkspaceTypes";
import type { Project } from "@/types/project";
import type { SidebarView } from "@/utils/activityBarOrder";

defineOptions({ name: "RepoWorkspaceLayout" });

withDefaults(
  defineProps<{
    project: Project;
    sidebarView: SidebarView;
    mainView: RepoMainView;
    toolbarLoading?: boolean;
    ariaBusy?: boolean;
  }>(),
  { toolbarLoading: false, ariaBusy: undefined },
);

const emit = defineEmits<{
  "update:sidebarView": [view: SidebarView];
  "update:mainView": [view: RepoMainView];
}>();
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden"
    data-repo-workspace-layout="true"
    :aria-busy="ariaBusy"
  >
    <RepoToolbar
      :key="project.path"
      :project="project"
      :main-view="mainView"
      :loading-shell="toolbarLoading"
      @update:main-view="(view) => emit('update:mainView', view)"
    />
    <slot name="banner" />
    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <ActivityBar :active="sidebarView" @change="(view) => emit('update:sidebarView', view)" />
      <div class="relative min-h-0 min-w-0 flex-1 overflow-hidden" data-repo-workspace-split="true">
        <ResizableSplit
          orientation="horizontal"
          :default-ratio="22"
          :min-first-px="240"
          :min-second-px="320"
          storage-key="jlgit:split:sidebar-main"
        >
          <template #first>
            <aside class="h-full min-h-0 overflow-hidden">
              <slot name="sidebar" />
            </aside>
          </template>
          <template #second>
            <div class="h-full min-h-0 min-w-0 overflow-hidden">
              <slot name="main" />
            </div>
          </template>
        </ResizableSplit>
        <slot name="overlay" />
      </div>
    </div>
  </div>
</template>
