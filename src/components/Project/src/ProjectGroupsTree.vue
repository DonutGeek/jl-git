<script setup lang="ts">
import { computed, ref } from "vue";

import { Button, Input, Modal, Tag, Tooltip, message } from "antdv-next";
import { useI18n } from "vue-i18n";

import { HighlightText } from "@/components/Common";
import { Icon } from "@/components/Icon";
import ProjectContextMenu from "./ProjectContextMenu.vue";
import ProjectIcon from "./ProjectIcon.vue";
import WorkspaceGroupDialog from "./WorkspaceGroupDialog.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { useZustand } from "@/hooks/core/useZustand";
import { cn } from "@/lib/utils";
import { useProjectStore, useProjectStoreWithOut } from "@/store/modules/project";
import { toUserMessage } from "@/types/error";
import type { Project, Workspace } from "@/types/project";

defineOptions({ name: "ProjectGroupsTree" });

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  open: [projectId: string];
}>();

type MixedTreeItem =
  | { kind: "workspace"; sortOrder: number; name: string; workspace: Workspace }
  | { kind: "project"; sortOrder: number; name: string; project: Project };

type TreeRow =
  | { kind: "workspace"; key: string; depth: number; workspace: Workspace }
  | { kind: "project"; key: string; depth: number; project: Project };

function compareMixedTreeItems(a: MixedTreeItem, b: MixedTreeItem): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  if (a.kind !== b.kind) {
    return a.kind === "project" ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

const { t } = useI18n();
const projects = useZustand(useProjectStore, (state) => state.projects);
const workspaces = useZustand(useProjectStore, (state) => state.workspaces);
const filter = ref("");
const rootExpanded = ref(true);
const collapsedWorkspaceIds = ref<Set<string>>(new Set());
const selectedProjectId = ref<string | null>(null);
const groupDialog = ref<
  { mode: "create"; parentId: string | null } | { mode: "edit"; workspace: Workspace } | null
>(null);
const deleteTarget = ref<Workspace | null>(null);
const deleteBusy = ref(false);

const query = computed(() => filter.value.trim().toLowerCase());
const visibleProjects = computed(() =>
  query.value
    ? projects.value.filter(
        (item) =>
          item.name.toLowerCase().includes(query.value) ||
          item.path.toLowerCase().includes(query.value),
      )
    : projects.value,
);

function buildMixedItems(parentId: string | null): MixedTreeItem[] {
  const workspaceIds = new Set(workspaces.value.map((item) => item.id));
  const childWorkspaces = workspaces.value.filter((item) =>
    parentId === null
      ? item.parentId === null || !workspaceIds.has(item.parentId)
      : item.parentId === parentId,
  );
  const childProjects = visibleProjects.value.filter((project) =>
    parentId === null ? project.workspaceId === null : project.workspaceId === parentId,
  );
  return [
    ...childWorkspaces.map((workspace) => ({
      kind: "workspace" as const,
      sortOrder: workspace.sortOrder,
      name: workspace.name,
      workspace,
    })),
    ...childProjects.map((project) => ({
      kind: "project" as const,
      sortOrder: project.sortOrder,
      name: project.name,
      project,
    })),
  ].sort(compareMixedTreeItems);
}

function flattenRows(parentId: string | null, depth: number): TreeRow[] {
  const rows: TreeRow[] = [];
  for (const item of buildMixedItems(parentId)) {
    if (item.kind === "workspace") {
      rows.push({
        kind: "workspace",
        key: `workspace-${item.workspace.id}`,
        depth,
        workspace: item.workspace,
      });
      if (!collapsedWorkspaceIds.value.has(item.workspace.id)) {
        rows.push(...flattenRows(item.workspace.id, depth + 1));
      }
    } else {
      rows.push({
        kind: "project",
        key: `project-${item.project.id}`,
        depth,
        project: item.project,
      });
    }
  }
  return rows;
}

const visibleRows = computed(() => (rootExpanded.value ? flattenRows(null, 1) : []));

function toggleWorkspace(workspaceId: string): void {
  const next = new Set(collapsedWorkspaceIds.value);
  if (next.has(workspaceId)) {
    next.delete(workspaceId);
  } else {
    next.add(workspaceId);
  }
  collapsedWorkspaceIds.value = next;
}

function openGroupProject(projectId: string): void {
  if (props.disabled) {
    return;
  }
  selectedProjectId.value = projectId;
  emit("open", projectId);
}

async function confirmDeleteGroup(): Promise<void> {
  if (!deleteTarget.value || deleteBusy.value) {
    return;
  }
  if (deleteTarget.value.locked) {
    message.error(t("projectManager.lockedGroupDeleteBlocked"));
    return;
  }
  deleteBusy.value = true;
  try {
    await useProjectStoreWithOut().removeWorkspace(deleteTarget.value.id);
    message.success(t("projectManager.deleteGroupSuccess", { name: deleteTarget.value.name }));
    deleteTarget.value = null;
  } catch (error) {
    message.error(toUserMessage(error));
  } finally {
    deleteBusy.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex shrink-0 items-start justify-between gap-4 pb-4">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold">{{ t("projectManager.groups") }}</h2>
          <Tag class="px-1.5 py-0 text-[10px] tabular-nums">
            {{ t("projectManager.groupsCount", { count: workspaces.length }) }}
          </Tag>
        </div>
        <p class="text-muted-foreground mt-0.5 text-xs">
          {{ t("projectManager.groupsDescription") }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
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
            :disabled="disabled"
          />
        </label>
        <Tooltip :title="t('projectManager.createGroup')">
          <Button
            :aria-label="t('projectManager.createGroup')"
            :disabled="disabled"
            @click="groupDialog = { mode: 'create', parentId: null }"
          >
            <Icon name="Plus" :size="16" />
          </Button>
        </Tooltip>
      </div>
    </div>

    <div class="min-h-0 flex-1">
      <ScrollArea class="h-full min-w-0 pb-4">
        <div class="space-y-0.5 pb-4 pr-4">
          <div
            class="group/row hover:bg-accent/60 flex h-9 w-full items-center gap-0.5 rounded-md transition-colors"
          >
            <button
              type="button"
              class="focus-visible:ring-ring flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
              @click="rootExpanded = !rootExpanded"
            >
              <Icon
                name="ChevronDown"
                :size="14"
                :class="
                  cn(
                    'text-muted-foreground shrink-0 transition-transform',
                    !rootExpanded && '-rotate-90',
                  )
                "
              />
              <Icon name="Folder" :size="16" class="text-muted-foreground shrink-0" />
              {{ t("projectManager.rootGroup") }}
            </button>
            <div
              class="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100"
            >
              <Tooltip :title="t('projectManager.createGroup')">
                <Button
                  type="text"
                  size="small"
                  :aria-label="t('projectManager.createGroup')"
                  :disabled="disabled"
                  @click="groupDialog = { mode: 'create', parentId: null }"
                >
                  <Icon name="Plus" :size="14" />
                </Button>
              </Tooltip>
            </div>
          </div>

          <template v-for="row in visibleRows" :key="row.key">
            <div v-if="row.kind === 'workspace'" :style="{ paddingLeft: `${row.depth * 20}px` }">
              <div
                class="group/row hover:bg-accent/60 flex h-9 w-full items-center gap-0.5 rounded-md transition-colors"
              >
                <button
                  type="button"
                  class="focus-visible:ring-ring flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  @click="toggleWorkspace(row.workspace.id)"
                >
                  <Icon
                    name="ChevronDown"
                    :size="14"
                    :class="
                      cn(
                        'text-muted-foreground shrink-0 transition-transform',
                        collapsedWorkspaceIds.has(row.workspace.id) && '-rotate-90',
                      )
                    "
                  />
                  <Icon name="Folder" :size="16" class="text-muted-foreground shrink-0" />
                  <span class="min-w-0 truncate font-medium">{{ row.workspace.name }}</span>
                </button>
                <div
                  class="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100"
                >
                  <Tooltip
                    :title="t('projectManager.createChildGroup', { name: row.workspace.name })"
                  >
                    <Button
                      type="text"
                      size="small"
                      :aria-label="
                        t('projectManager.createChildGroup', { name: row.workspace.name })
                      "
                      :disabled="disabled"
                      @click="groupDialog = { mode: 'create', parentId: row.workspace.id }"
                    >
                      <Icon name="Plus" :size="14" />
                    </Button>
                  </Tooltip>
                  <Tooltip :title="t('projectManager.editGroup')">
                    <Button
                      type="text"
                      size="small"
                      :aria-label="t('projectManager.editGroup')"
                      :disabled="disabled"
                      @click="groupDialog = { mode: 'edit', workspace: row.workspace }"
                    >
                      <Icon name="Pencil" :size="14" />
                    </Button>
                  </Tooltip>
                  <Tooltip
                    :title="
                      row.workspace.locked
                        ? t('projectManager.lockedGroupDeleteBlocked')
                        : t('projectManager.deleteGroup')
                    "
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      :aria-label="t('projectManager.deleteGroup')"
                      :disabled="disabled || row.workspace.locked"
                      @click="deleteTarget = row.workspace"
                    >
                      <Icon name="Trash2" :size="14" />
                    </Button>
                  </Tooltip>
                </div>
              </div>
            </div>
            <div v-else :style="{ paddingLeft: `${row.depth * 20}px` }">
              <ProjectContextMenu
                :project="row.project"
                :disabled="disabled"
                @open="openGroupProject"
                @menu-open="selectedProjectId = row.project.id"
              >
                <button
                  type="button"
                  :disabled="disabled"
                  :class="
                    cn(
                      'focus-visible:ring-ring group relative flex h-9 w-full min-w-0 items-center gap-2.5 rounded-md px-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
                      selectedProjectId === row.project.id
                        ? 'bg-accent hover:bg-accent'
                        : 'hover:bg-accent/60',
                    )
                  "
                  @click="
                    selectedProjectId = selectedProjectId === row.project.id ? null : row.project.id
                  "
                  @dblclick="openGroupProject(row.project.id)"
                >
                  <span
                    :class="
                      cn(
                        'text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
                        selectedProjectId === row.project.id
                          ? 'bg-muted-foreground/12 ring-border/60 ring-1 ring-inset'
                          : 'bg-muted group-hover:bg-muted-foreground/10',
                      )
                    "
                  >
                    <ProjectIcon :name="row.project.icon" class-name="size-3.5" />
                  </span>
                  <HighlightText
                    :text="row.project.name"
                    :query="filter"
                    class-name="min-w-0 flex-1 truncate text-sm font-medium"
                  />
                </button>
              </ProjectContextMenu>
            </div>
          </template>
        </div>
      </ScrollArea>
    </div>

    <WorkspaceGroupDialog
      v-if="groupDialog?.mode === 'create'"
      :open="true"
      mode="create"
      :initial-parent-id="groupDialog.parentId"
      @update:open="(open: boolean) => !open && (groupDialog = null)"
    />
    <WorkspaceGroupDialog
      v-if="groupDialog?.mode === 'edit'"
      :open="true"
      mode="edit"
      :workspace="groupDialog.workspace"
      @update:open="(open: boolean) => !open && (groupDialog = null)"
    />
    <Modal
      :open="Boolean(deleteTarget)"
      :title="t('projectManager.deleteGroupTitle')"
      :ok-text="t('projectManager.deleteGroupAction')"
      :cancel-text="t('common.cancel')"
      ok-type="danger"
      :confirm-loading="deleteBusy"
      @update:open="(open: boolean) => !open && !deleteBusy && (deleteTarget = null)"
      @ok="void confirmDeleteGroup()"
    >
      <p class="text-sm">
        {{ t("projectManager.deleteGroupQuestion", { name: deleteTarget?.name ?? "" }) }}
      </p>
    </Modal>
  </div>
</template>
