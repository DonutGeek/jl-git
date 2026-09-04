<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";

import { Button } from "antdv-next";
import { useI18n } from "vue-i18n";

import { AgentChatPanel } from "@/components/Ai";
import {
  BranchList,
  ChangesPanel,
  ChangesPreviewPane,
  CommitBox,
  HistoryWorkspace,
  RepoOperationBanner,
} from "@/components/Git";
import RepoWorkspaceLayout from "./components/RepoWorkspaceLayout.vue";
import ResizableSplit from "@/layouts/default/components/ResizableSplit.vue";
import { useWindowChromeLayout } from "@/hooks/core/useWindowChromeLayout";

import RepoSidebarPlaceholder from "./components/RepoSidebarPlaceholder.vue";
import { createRepoBootstrapStub, useRepoPage } from "./hooks/useRepoPage";

defineOptions({ name: "RepoPage" });

const props = withDefaults(
  defineProps<{
    projectId: string;
    active?: boolean;
  }>(),
  { active: true },
);

const { t } = useI18n();
const router = useRouter();
const { isMacOverlay } = useWindowChromeLayout();
const { project, error, bootstrapping, sidebarView, mainView, hasApiKey, retryBootstrap } =
  useRepoPage(
    () => props.projectId,
    () => props.active,
  );

const layoutProject = computed(() => project.value ?? createRepoBootstrapStub(props.projectId));
</script>

<template>
  <section
    v-if="(bootstrapping && !error) || error || !project"
    class="flex h-full flex-col"
    :data-tauri-drag-region="isMacOverlay ? true : undefined"
  >
    <RepoWorkspaceLayout
      v-if="bootstrapping && !error"
      :project="layoutProject"
      :sidebar-view="sidebarView"
      :main-view="mainView"
      toolbar-loading
      :aria-busy="true"
      @update:sidebar-view="(view) => (sidebarView = view)"
      @update:main-view="(view) => (mainView = view)"
    >
      <template #sidebar>
        <div class="text-muted-foreground flex h-full items-center justify-center text-xs">
          {{ t("common.loading") }}
        </div>
      </template>
      <template #main>
        <div class="text-muted-foreground flex h-full items-center justify-center text-xs">
          {{ t("common.loading") }}
        </div>
      </template>
    </RepoWorkspaceLayout>
    <div
      v-else
      class="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p class="text-destructive text-sm" role="alert">{{ error ?? t("repo.notFound") }}</p>
      <div class="flex items-center gap-2">
        <Button v-if="project" type="primary" size="small" @click="retryBootstrap">
          {{ t("repo.refresh") }}
        </Button>
        <Button size="small" @click="router.push('/')">{{ t("common.back") }}</Button>
      </div>
    </div>
  </section>

  <RepoWorkspaceLayout
    v-else-if="project"
    :project="project"
    :sidebar-view="sidebarView"
    :main-view="mainView"
    @update:sidebar-view="(view) => (sidebarView = view)"
    @update:main-view="(view) => (mainView = view)"
  >
    <template #banner>
      <RepoOperationBanner />
    </template>
    <template #sidebar>
      <BranchList v-if="sidebarView === 'branches'" :key="project.path" />
      <RepoSidebarPlaceholder
        v-else-if="sidebarView === 'files'"
        icon="FolderTree"
        :title="t('repo.fileTree')"
        :description="t('repo.fileTreeEmpty')"
      />
      <RepoSidebarPlaceholder
        v-else-if="sidebarView === 'tags'"
        icon="Tag"
        :title="t('repo.tags')"
        :description="t('repo.historyEmpty')"
      />
      <AgentChatPanel
        v-else-if="sidebarView === 'agent' && hasApiKey"
        :project-id="project.id"
        :repo-path="project.path"
      />
    </template>
    <template #main>
      <div class="h-full min-h-0 min-w-0 overflow-hidden">
        <ResizableSplit
          v-if="mainView === 'changes'"
          orientation="horizontal"
          :default-ratio="26"
          :min-first-px="240"
          :min-second-px="280"
          storage-key="jlgit:split:changes-preview"
        >
          <template #first>
            <ResizableSplit
              orientation="vertical"
              :default-ratio="65"
              :min-first-px="240"
              :min-second-px="200"
              storage-key="jlgit:split:changes-commit"
            >
              <template #first>
                <ChangesPanel :key="project.path" />
              </template>
              <template #second>
                <CommitBox :key="project.path" :active="active" />
              </template>
            </ResizableSplit>
          </template>
          <template #second>
            <ChangesPreviewPane :key="project.path" />
          </template>
        </ResizableSplit>
        <HistoryWorkspace v-else-if="mainView === 'history'" :key="project.path" />
        <RepoSidebarPlaceholder
          v-else
          icon="Folder"
          :title="t('repo.viewWorkspace')"
          :description="t('common.migrationDescription')"
        />
      </div>
    </template>
  </RepoWorkspaceLayout>
</template>
