<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";

import { Card, Dropdown, Empty, Input, Listy, Spin, Tag, Tooltip, Typography } from "antdv-next";
import { useClipboard } from "@vueuse/core";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";

import { useMessage } from "@/hooks/web/useMessage";
import { useProjectMenu } from "@/hooks/web/useProjectMenu";

import { useProjectStore } from "@/store/modules/project";

import { parseRemoteRepository, type RemoteRepository } from "@/utils/remoteRepository";

import type { Project } from "@/types/project";

defineOptions({ name: "RecentProjectList" });

interface RecentListRow {
  project: Project;
  remote: RemoteRepository | null;
}

const emit = defineEmits<{
  open: [projectId: string];
}>();

const { t } = useI18n();
const message = useMessage();
const { copy } = useClipboard({ legacy: true });
const projectStore = useProjectStore();
const { recentProjects: rows } = storeToRefs(projectStore);
const filter = ref("");
const loading = ref(false);
const { menuItems, handleMenuClick } = useProjectMenu({
  onOpen: (projectId) => emit("open", projectId),
  deleteMode: "recent",
});

/** 解析主远端，列表右侧展示可复制的仓库名 */
function remoteOf(project: Project) {
  const remoteUrl = project.remoteUrl?.trim();
  return remoteUrl ? parseRemoteRepository(remoteUrl) : null;
}

const filteredRows = computed(() => {
  const query = filter.value.trim().toLowerCase();
  const source = query
    ? rows.value.filter(
        (item) =>
          item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query),
      )
    : rows.value;
  return source.map((project): RecentListRow => ({
    project,
    remote: remoteOf(project),
  }));
});

/** Listy 行键：项目 id */
function getRowKey(item: RecentListRow): string {
  return item.project.id;
}

let mounted = true;
onMounted(() => {
  loadRecentCatalog();
});
onUnmounted(() => {
  mounted = false;
});

/** 同时拉登记仓库和最近打开记录 */
async function loadRecentCatalog() {
  loading.value = true;
  try {
    await Promise.all([projectStore.loadProjects(), projectStore.loadRecent()]);
  } catch (error) {
    if (mounted) {
      message.error(error);
    }
  } finally {
    if (mounted) {
      loading.value = false;
    }
  }
}

/** 打开最近列表里的仓库 */
function handleOpenProject(id: string): void {
  emit("open", id);
}

/** 复制远端 URL */
async function copyRemoteUrl(url: string): Promise<void> {
  try {
    await copy(url);
    message.success(t("repo.copySuccess"));
  } catch (error) {
    message.error(error);
  }
}
</script>

<template>
  <Card>
    <template #title>
      <span class="inline-flex items-center gap-2">
        {{ t("dashboard.recentTitle") }}
        <Tag>{{ t("dashboard.recentCount", { count: rows.length }) }}</Tag>
      </span>
    </template>
    <template #extra>
      <Input v-model:value="filter" class="w-52" :placeholder="t('repo.filter')">
        <template #prefix>
          <Icon name="Search" :size="14" />
        </template>
      </Input>
    </template>

    <Spin :spinning="loading">
      <Empty v-if="filteredRows.length === 0" :description="t('common.empty')" />

      <Listy v-else :items="filteredRows" :row-key="getRowKey">
        <template #itemRender="{ project, remote }">
          <Dropdown
            :trigger="['contextmenu']"
            :menu="{ items: menuItems, onClick: handleMenuClick(project) }"
          >
            <button
              type="button"
              class="group relative flex! w-full min-w-0 items-center gap-3 px-3 py-3 text-left"
              @click="handleOpenProject(project.id)"
            >
              <span
                v-if="project.icon"
                class="bg-muted text-muted-foreground group-hover:bg-muted-foreground/10 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
              >
                <Icon :name="project.icon" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-center gap-2">
                  <Typography.Text class="min-w-0 flex-1 truncate" strong>
                    {{ project.name }}
                  </Typography.Text>
                  <Tooltip v-if="remote" :title="t('repo.copy')">
                    <Typography.Link
                      class="ml-auto inline-flex w-max max-w-[46%] min-w-0 shrink-0 items-center gap-1 font-mono text-xs"
                      :title="remote.url"
                      @click.stop.prevent="copyRemoteUrl(remote.url)"
                    >
                      <Icon name="GitFork" :size="14" class="shrink-0" />
                      <span class="truncate">{{ remote.repositoryName }}</span>
                    </Typography.Link>
                  </Tooltip>
                </span>
                <Typography.Text class="mt-0.5 block truncate text-xs" type="secondary">
                  {{ project.path }}
                </Typography.Text>
              </span>
            </button>
          </Dropdown>
        </template>
      </Listy>
    </Spin>
  </Card>
</template>
