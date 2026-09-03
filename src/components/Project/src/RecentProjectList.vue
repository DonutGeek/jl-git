<script setup lang="ts">
import { computed, ref } from "vue";

import { Input, Spin, Tag } from "antdv-next";
import { useI18n } from "vue-i18n";

import { HighlightText } from "@/components/Common";
import { Icon } from "@/components/Icon";
import ProjectContextMenu from "./ProjectContextMenu.vue";
import ProjectIcon from "./ProjectIcon.vue";
import RemoteRepositoryLabel from "./RemoteRepositoryLabel.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { useZustand } from "@/hooks/core/useZustand";
import { cn } from "@/lib/utils";
import { gitService, pickPrimaryRemoteUrl } from "@/services/git";
import { openExternalUrl } from "@/services/system/open-url";
import { useProjectStore } from "@/store/modules/project";
import type { Project, RecentItem } from "@/types/project";
import { parseRemoteRepository } from "@/utils/remoteRepository";

defineOptions({ name: "RecentProjectList" });

const emit = defineEmits<{
  open: [projectId: string];
}>();

const { t } = useI18n();
const projects = useZustand(useProjectStore, (state) => state.projects);
const recent = useZustand(useProjectStore, (state) => state.recent);
const loading = useZustand(useProjectStore, (state) => state.loading);
const selectedId = ref<string | null>(null);
const hoveredId = ref<string | null>(null);
const filter = ref("");
const remoteUrls = ref<Record<string, string | null>>({});

function mergeRecentProjects(items: RecentItem[], allProjects: Project[]): Project[] {
  const projectById = new Map(allProjects.map((project) => [project.id, project]));
  return items.flatMap((item) => {
    const project = projectById.get(item.projectId);
    if (!project) {
      return [];
    }
    return [{ ...project, lastOpenedAt: item.openedAt || project.lastOpenedAt }];
  });
}

const rows = computed(() => mergeRecentProjects(recent.value, projects.value));
const filteredRows = computed(() => {
  const query = filter.value.trim().toLowerCase();
  if (!query) {
    return rows.value;
  }
  return rows.value.filter(
    (item) => item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query),
  );
});

function handleOpenProject(id: string): void {
  selectedId.value = id;
  emit("open", id);
}

async function showRemoteUrl(project: Project): Promise<void> {
  hoveredId.value = project.id;
  if (project.id in remoteUrls.value) {
    return;
  }
  try {
    const remotes = await gitService.listRemotes(project.path);
    remoteUrls.value = {
      ...remoteUrls.value,
      [project.id]: pickPrimaryRemoteUrl(remotes),
    };
  } catch (error) {
    console.warn("读取仓库远程地址失败", error);
    remoteUrls.value = { ...remoteUrls.value, [project.id]: null };
  }
}

function remoteOf(project: Project) {
  const remoteUrl = remoteUrls.value[project.id];
  return remoteUrl ? parseRemoteRepository(remoteUrl) : null;
}

async function openRemoteUrl(url: string): Promise<void> {
  try {
    await openExternalUrl(url);
  } catch (error) {
    console.warn("打开仓库远程地址失败", error);
  }
}
</script>

<template>
  <div
    v-if="rows.length === 0"
    class="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center"
  >
    <div class="bg-muted flex size-14 items-center justify-center rounded-2xl">
      <ProjectIcon class-name="text-muted-foreground size-7" />
    </div>
    <h2 class="mt-5 text-lg font-semibold">{{ t("dashboard.recentEmptyTitle") }}</h2>
    <p class="text-muted-foreground mt-2 flex max-w-sm items-center justify-center gap-2 text-sm">
      <template v-if="loading">
        <Spin size="small" />
        {{ t("common.loading") }}
      </template>
      <template v-else>{{ t("dashboard.recentEmptyDescription") }}</template>
    </p>
  </div>

  <div v-else class="flex min-h-0 flex-1 flex-col">
    <div class="flex shrink-0 items-start justify-between gap-4 pb-4">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold">{{ t("dashboard.recentTitle") }}</h2>
          <Tag class="px-1.5 py-0 text-[10px] tabular-nums">
            {{ t("dashboard.recentCount", { count: rows.length }) }}
          </Tag>
        </div>
        <p class="text-muted-foreground mt-0.5 text-xs">{{ t("dashboard.recentDescription") }}</p>
      </div>
      <label class="relative block w-52">
        <Icon
          name="Search"
          :size="14"
          class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
        />
        <Input
          v-model:value="filter"
          class="h-8 bg-background pr-3 pl-8 text-xs"
          :placeholder="t('repo.filter')"
          :aria-label="t('repo.filter')"
        />
      </label>
    </div>

    <div class="min-h-0 flex-1">
      <ScrollArea class="h-full min-w-0 pb-4">
        <ul class="space-y-1 pb-1" role="listbox" :aria-label="t('dashboard.recentTitle')">
          <li
            v-for="project in filteredRows"
            :key="project.id"
            role="option"
            :aria-selected="selectedId === project.id"
          >
            <ProjectContextMenu
              :project="project"
              @open="handleOpenProject"
              @menu-open="selectedId = project.id"
            >
              <button
                type="button"
                :class="
                  cn(
                    'focus-visible:ring-ring group relative flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
                    selectedId === project.id ? 'bg-accent hover:bg-accent' : 'hover:bg-accent/60',
                  )
                "
                @click="selectedId = selectedId === project.id ? null : project.id"
                @dblclick="handleOpenProject(project.id)"
                @mouseenter="void showRemoteUrl(project)"
                @mouseleave="hoveredId = null"
                @focus="void showRemoteUrl(project)"
                @blur="hoveredId = null"
                @keydown.enter.prevent="
                  selectedId === project.id ? handleOpenProject(project.id) : undefined
                "
              >
                <span
                  :class="
                    cn(
                      'text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md transition-colors',
                      selectedId === project.id
                        ? 'bg-muted-foreground/12 ring-border/60 ring-1 ring-inset'
                        : 'bg-muted group-hover:bg-muted-foreground/10 group-focus-visible:bg-muted-foreground/10',
                    )
                  "
                >
                  <ProjectIcon :name="project.icon" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex min-w-0 items-center gap-2">
                    <HighlightText
                      :text="project.name"
                      :query="filter"
                      class-name="truncate text-sm font-medium"
                    />
                    <RemoteRepositoryLabel
                      v-if="hoveredId === project.id && remoteOf(project)"
                      :remote="remoteOf(project)!"
                      @open="(url) => void openRemoteUrl(url)"
                    />
                  </span>
                  <HighlightText
                    :text="project.path"
                    :query="filter"
                    :title="project.path"
                    class-name="text-muted-foreground mt-0.5 block truncate text-xs"
                  />
                </span>
              </button>
            </ProjectContextMenu>
          </li>
        </ul>
      </ScrollArea>
    </div>
  </div>
</template>
