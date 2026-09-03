<script setup lang="ts">
import { computed, h, ref } from "vue";

import { Button, Modal, Pagination, Select, Spin, Table, Tag, Tooltip, message } from "antdv-next";
import { useI18n } from "vue-i18n";

import { HighlightText } from "@/components/Common";
import { Icon } from "@/components/Icon";
import ProjectContextMenu from "./ProjectContextMenu.vue";
import ProjectIcon from "./ProjectIcon.vue";
import ProjectManageFilterForm from "./ProjectManageFilterForm.vue";
import ProjectSettingsDialog from "./ProjectSettingsDialog.vue";
import RemoteRepositoryLabel from "./RemoteRepositoryLabel.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { useZustand } from "@/hooks/core/useZustand";
import {
  useProjectManageGitProbe,
  type ProjectManageGitSnapshot,
} from "@/hooks/web/useProjectManageGitProbe";
import { openExternalUrl } from "@/services/system/open-url";
import { useProjectStore, useProjectStoreWithOut } from "@/store/modules/project";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";
import {
  EMPTY_MANAGE_FILTERS,
  MANAGE_DIRTY_ALL,
  MANAGE_SYNC_ALL,
  filterAndSortProjects,
  type ManageFilters,
} from "@/utils/projectManageFilter";
import { parseRemoteRepository } from "@/utils/remoteRepository";
import { withSoftWrapOpportunities } from "@/utils/softWrapText";

defineOptions({ name: "ProjectManagePanel" });

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  open: [projectId: string];
  mutated: [];
}>();

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 50];

const { t } = useI18n();
const projects = useZustand(useProjectStore, (state) => state.projects);
const workspaces = useZustand(useProjectStore, (state) => state.workspaces);
const loading = useZustand(useProjectStore, (state) => state.loading);
const draftFilters = ref<ManageFilters>({ ...EMPTY_MANAGE_FILTERS });
const appliedFilters = ref<ManageFilters>({ ...EMPTY_MANAGE_FILTERS });
const page = ref(1);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const settingsProject = ref<Project | null>(null);
const deleteProject = ref<Project | null>(null);
const deleting = ref(false);
const gitRefreshToken = ref(0);

const workspaceNameById = computed(() => {
  const map = new Map<string, string>();
  for (const workspace of workspaces.value) {
    map.set(workspace.id, workspace.name);
  }
  return map;
});

const needsWideProbe = computed(
  () =>
    appliedFilters.value.dirty !== MANAGE_DIRTY_ALL ||
    appliedFilters.value.sync !== MANAGE_SYNC_ALL,
);

const baseFiltered = computed(() =>
  filterAndSortProjects(
    projects.value,
    { ...appliedFilters.value, dirty: MANAGE_DIRTY_ALL, sync: MANAGE_SYNC_ALL },
    new Map(),
  ),
);

const pageForProbe = computed(() => {
  const totalPages = Math.max(1, Math.ceil(baseFiltered.value.length / pageSize.value));
  const currentPage = Math.min(page.value, totalPages);
  return baseFiltered.value.slice((currentPage - 1) * pageSize.value, currentPage * pageSize.value);
});

const probeTargets = computed(() =>
  needsWideProbe.value ? baseFiltered.value : pageForProbe.value,
);
const { snapshots, lites } = useProjectManageGitProbe(probeTargets, gitRefreshToken);

const filtered = computed(() =>
  filterAndSortProjects(projects.value, appliedFilters.value, lites.value),
);

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)));
const currentPage = computed(() => Math.min(page.value, totalPages.value));
const pageRows = computed(() =>
  filtered.value.slice(
    (currentPage.value - 1) * pageSize.value,
    currentPage.value * pageSize.value,
  ),
);

function updateDraft<K extends keyof ManageFilters>(key: K, value: ManageFilters[K]): void {
  draftFilters.value = { ...draftFilters.value, [key]: value };
}

function applyFilters(next: ManageFilters): void {
  appliedFilters.value = next;
  draftFilters.value = next;
  page.value = 1;
}

function handleOpen(projectId: string): void {
  if (props.disabled) {
    return;
  }
  emit("open", projectId);
}

async function handleDelete(): Promise<void> {
  if (!deleteProject.value || deleting.value) {
    return;
  }
  deleting.value = true;
  try {
    await useProjectStoreWithOut().removeProject(deleteProject.value.id);
    message.success(t("projectManager.deleteProjectSuccess", { name: deleteProject.value.name }));
    deleteProject.value = null;
    emit("mutated");
  } catch (error) {
    message.error(toUserMessage(error));
  } finally {
    deleting.value = false;
  }
}

function groupLabelOf(project: Project): string {
  return project.workspaceId
    ? (workspaceNameById.value.get(project.workspaceId) ?? t("projectManager.ungrouped"))
    : t("projectManager.ungrouped");
}

function renderGitCell(snapshot?: ProjectManageGitSnapshot) {
  if (!snapshot || snapshot.status === "idle") {
    return h("span", { class: "text-muted-foreground text-xs" }, "—");
  }
  if (snapshot.status === "loading") {
    return h(Spin, { size: "small" });
  }
  if (snapshot.status === "error") {
    return h(
      Tooltip,
      { title: snapshot.error ?? t("projectManager.manageGitProbeFailed") },
      {
        default: () => h("span", { class: "text-destructive text-xs" }, "!"),
      },
    );
  }
  const label = snapshot.detached ? t("projectManager.manageDetached") : (snapshot.branch ?? "—");
  return h(Tag, { title: label }, { default: () => label });
}

function renderRemoteCell(snapshot?: ProjectManageGitSnapshot) {
  if (!snapshot || snapshot.status === "idle") {
    return h("span", { class: "text-muted-foreground text-xs" }, "—");
  }
  if (snapshot.status === "loading") {
    return h(Spin, { size: "small" });
  }
  if (snapshot.status === "error") {
    return h(
      Tooltip,
      { title: snapshot.error ?? t("projectManager.manageGitProbeFailed") },
      {
        default: () => h("span", { class: "text-destructive text-xs" }, "!"),
      },
    );
  }
  const remote = snapshot.remoteUrl ? parseRemoteRepository(snapshot.remoteUrl) : null;
  if (!remote) {
    return h("span", { class: "text-muted-foreground text-xs" }, "—");
  }
  return h(RemoteRepositoryLabel, {
    remote,
    className: "ml-0 max-w-full min-w-0",
    onOpen: (url: string) => {
      void openExternalUrl(url);
    },
  });
}

interface ManageTableColumn {
  title: string;
  key: string;
  width?: number;
  align?: "left" | "right" | "center";
  customRender: (ctx: { record: Project }) => unknown;
}

const columns = computed<ManageTableColumn[]>(() => [
  {
    title: t("projectManager.manageColName"),
    key: "name",
    customRender: ({ record }) =>
      h(
        ProjectContextMenu,
        {
          project: record,
          disabled: props.disabled,
          onOpen: handleOpen,
          onRemoved: () => emit("mutated"),
        },
        {
          default: () =>
            h(
              "button",
              {
                type: "button",
                disabled: props.disabled,
                class:
                  "hover:text-primary flex max-w-full min-w-0 cursor-pointer items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
                onClick: () => handleOpen(record.id),
              },
              [
                h(ProjectIcon, { name: record.icon, className: "size-4 shrink-0" }),
                h(HighlightText, {
                  text: record.name,
                  query: appliedFilters.value.keyword,
                  className: "truncate font-medium underline-offset-2 hover:underline",
                }),
              ],
            ),
        },
      ),
  },
  {
    title: t("projectManager.manageColGroup"),
    key: "group",
    width: 112,
    customRender: ({ record }) =>
      h(Tag, { title: groupLabelOf(record) }, { default: () => groupLabelOf(record) }),
  },
  {
    title: t("projectManager.manageColPath"),
    key: "path",
    customRender: ({ record }) =>
      h(
        "span",
        { class: "text-muted-foreground text-xs", title: record.path },
        withSoftWrapOpportunities(record.path),
      ),
  },
  {
    title: t("projectManager.manageColBranch"),
    key: "branch",
    customRender: ({ record }) => renderGitCell(snapshots.value.get(record.id)),
  },
  {
    title: t("projectManager.manageColRemote"),
    key: "remote",
    customRender: ({ record }) => renderRemoteCell(snapshots.value.get(record.id)),
  },
  {
    title: t("projectManager.manageColActions"),
    key: "actions",
    width: 144,
    align: "right",
    customRender: ({ record }) =>
      h("div", { class: "inline-flex items-center justify-end gap-0.5" }, [
        h(
          Tooltip,
          { title: t("projectManager.manageEditAction") },
          {
            default: () =>
              h(
                Button,
                {
                  type: "text",
                  size: "small",
                  disabled: props.disabled,
                  "aria-label": t("projectManager.manageEditAction"),
                  onClick: () => {
                    settingsProject.value = record;
                  },
                },
                { default: () => h(Icon, { name: "SquarePen", size: 14 }) },
              ),
          },
        ),
        h(
          Tooltip,
          { title: t("projectManager.deleteProject") },
          {
            default: () =>
              h(
                Button,
                {
                  type: "text",
                  size: "small",
                  danger: true,
                  disabled: props.disabled,
                  "aria-label": t("projectManager.deleteProject"),
                  onClick: () => {
                    deleteProject.value = record;
                  },
                },
                { default: () => h(Icon, { name: "Trash2", size: 14 }) },
              ),
          },
        ),
      ]),
  },
]);

const pageSizeOptions = computed(() =>
  PAGE_SIZE_OPTIONS.map((size) => ({
    value: size,
    label: t("projectManager.managePageSizeOption", { count: size }),
  })),
);
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    <ProjectManageFilterForm
      :draft="draftFilters"
      :disabled="disabled || loading"
      @draft-change="(key, value) => updateDraft(key, value)"
      @submit="applyFilters(draftFilters)"
      @reset="applyFilters({ ...EMPTY_MANAGE_FILTERS })"
    />
    <div class="flex shrink-0 items-center justify-end">
      <Tooltip :title="t('projectManager.manageRefreshGit')">
        <Button
          :aria-label="t('projectManager.manageRefreshGit')"
          :disabled="disabled || loading"
          @click="gitRefreshToken += 1"
        >
          <Icon name="RefreshCw" :size="14" />
        </Button>
      </Tooltip>
    </div>
    <div class="border-border min-h-0 flex-1 overflow-hidden rounded-md border">
      <ScrollArea class="h-full">
        <Table
          size="small"
          :columns="columns"
          :data-source="pageRows"
          :loading="loading"
          :pagination="false"
          :row-key="(row: Project) => row.id"
          :locale="{ emptyText: t('projectManager.manageEmpty') }"
        />
      </ScrollArea>
    </div>
    <footer class="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-muted-foreground text-xs tabular-nums">
          {{
            t("projectManager.managePageStatus", {
              page: currentPage,
              total: totalPages,
              count: filtered.length,
            })
          }}
        </p>
        <Select
          class="w-[7.5rem]"
          :value="pageSize"
          :options="pageSizeOptions"
          :disabled="disabled"
          :aria-label="t('projectManager.managePageSize')"
          @update:value="
            (next) => {
              const parsed = Number(next);
              if (Number.isFinite(parsed) && parsed > 0) {
                pageSize = parsed;
                page = 1;
              }
            }
          "
        />
      </div>
      <Pagination
        :current="currentPage"
        :total="filtered.length"
        :page-size="pageSize"
        :disabled="disabled"
        size="small"
        :show-size-changer="false"
        @change="(next: number) => (page = next)"
      />
    </footer>

    <ProjectSettingsDialog
      v-if="settingsProject"
      :project="settingsProject"
      :open="true"
      @update:open="
        (open: boolean) => {
          if (!open) {
            settingsProject = null;
            emit('mutated');
          }
        }
      "
    />
    <Modal
      :open="Boolean(deleteProject)"
      :title="t('projectManager.deleteProjectTitle')"
      :ok-text="t('projectManager.deleteProject')"
      :cancel-text="t('common.cancel')"
      ok-type="danger"
      :confirm-loading="deleting"
      @update:open="(open: boolean) => !open && !deleting && (deleteProject = null)"
      @ok="void handleDelete()"
    >
      <p class="text-sm">
        {{ t("projectManager.deleteProjectQuestion", { name: deleteProject?.name ?? "" }) }}
      </p>
    </Modal>
  </div>
</template>
