<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";

import {
  Button,
  Card,
  Dropdown,
  Input,
  Space,
  Spin,
  Tag,
  Tooltip,
  Tree,
  type MenuProps,
  type TreeDataNode,
} from "antdv-next";
import { useElementSize } from "@vueuse/core";
import { useI18n } from "vue-i18n";

import { HighlightText } from "@/components/Common";
import { Icon } from "@/components/Icon";
import { ProjectSettingsDialog, WorkspaceGroupDialog } from "@/components/Project";

import { useMessage } from "@/hooks/web/useMessage";
import { useModal } from "@/hooks/web/useModal";
import { useProjectMenu } from "@/hooks/web/useProjectMenu";

import { useProjectStore, useProjectStoreWithOut } from "@/store/modules/project";

import type { Project, Workspace } from "@/types/project";

defineOptions({ name: "ProjectGroupsTree" });

const ROOT_KEY = "root";

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

interface GroupTreeNode extends TreeDataNode {
  kind: "root" | "workspace" | "project";
  workspace?: Workspace;
  project?: Project;
  children?: GroupTreeNode[];
}

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
const message = useMessage();
const modal = useModal();
const projectStore = useProjectStore();
const { projects, workspaces } = storeToRefs(projectStore);
const filter = ref("");
const loading = ref(false);
const expandedKeys = ref<Array<string | number>>([ROOT_KEY]);
const selectedProjectId = ref<string | null>(null);
const groupDialog = ref<
  { mode: "create"; parentId: string | null } | { mode: "edit"; workspace: Workspace } | null
>(null);
const treeHostRef = ref<HTMLElement | null>(null);
const { height: treeHostHeight } = useElementSize(treeHostRef);
const { menuItems, settingsProject, handleMenuClick } = useProjectMenu({
  disabled: () => props.disabled,
  onOpen: (projectId) => openGroupProject(projectId),
});

let mounted = true;
onMounted(() => {
  loadGroupCatalog();
});
onUnmounted(() => {
  mounted = false;
});

async function loadGroupCatalog() {
  loading.value = true;
  try {
    await Promise.all([projectStore.loadProjects(), projectStore.loadWorkspaces()]);
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

const treeHeight = computed(() => Math.max(0, Math.floor(treeHostHeight.value)));
const selectedKeys = computed(() =>
  selectedProjectId.value ? [`project:${selectedProjectId.value}`] : [],
);

function workspaceNodeKey(id: string): string {
  return `workspace:${id}`;
}

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

function buildChildNodes(parentId: string | null): GroupTreeNode[] {
  const nodes: GroupTreeNode[] = [];
  for (const item of buildMixedItems(parentId)) {
    if (item.kind === "workspace") {
      nodes.push({
        key: workspaceNodeKey(item.workspace.id),
        title: item.workspace.name,
        kind: "workspace",
        workspace: item.workspace,
        isLeaf: false,
        selectable: false,
        children: buildChildNodes(item.workspace.id),
      });
      continue;
    }
    nodes.push({
      key: `project:${item.project.id}`,
      title: item.project.name,
      kind: "project",
      project: item.project,
      isLeaf: true,
    });
  }
  return nodes;
}

const treeData = computed<GroupTreeNode[]>(() => [
  {
    key: ROOT_KEY,
    title: t("projectManager.rootGroup"),
    kind: "root",
    isLeaf: false,
    selectable: false,
    children: buildChildNodes(null),
  },
]);

function collectExpandableKeys(nodes: GroupTreeNode[]): Array<string | number> {
  const keys: Array<string | number> = [];
  for (const node of nodes) {
    if (node.children) {
      keys.push(node.key);
      keys.push(...collectExpandableKeys(node.children));
    }
  }
  return keys;
}

watch(
  treeData,
  (nodes, previous) => {
    const nextSignature = collectExpandableKeys(nodes).join("|");
    const previousSignature = previous ? collectExpandableKeys(previous).join("|") : "";
    if (nextSignature !== previousSignature) {
      expandedKeys.value = collectExpandableKeys(nodes);
    }
  },
  { immediate: true },
);

function resolveGroupNode(payload: unknown): GroupTreeNode | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (record.kind === "root" || record.kind === "workspace" || record.kind === "project") {
    return payload as GroupTreeNode;
  }
  const nested = record.data;
  if (nested && typeof nested === "object" && "kind" in nested) {
    return nested as GroupTreeNode;
  }
  return null;
}

function openCreateRootGroup(): void {
  groupDialog.value = { mode: "create", parentId: null };
}

function openCreateChildGroup(workspace: Workspace): void {
  groupDialog.value = { mode: "create", parentId: workspace.id };
}

function openEditGroup(workspace: Workspace): void {
  groupDialog.value = { mode: "edit", workspace };
}

function askDeleteGroup(workspace: Workspace): void {
  if (workspace.locked) {
    message.error(t("projectManager.lockedGroupDeleteBlocked"));
    return;
  }
  modal.confirm({
    title: t("projectManager.deleteGroupTitle"),
    content: t("projectManager.deleteGroupQuestion", { name: workspace.name }),
    icon: null,
    okType: "danger",
    okText: t("projectManager.deleteGroupAction"),
    async onOk() {
      try {
        await useProjectStoreWithOut().removeWorkspace(workspace.id);
        message.success(t("projectManager.deleteGroupSuccess", { name: workspace.name }));
      } catch (error) {
        message.error(error);
        throw error;
      }
    },
  });
}

function handleGroupDialogOpen(open: boolean): void {
  if (!open) {
    groupDialog.value = null;
  }
}

function handleSettingsOpen(open: boolean): void {
  if (!open) {
    settingsProject.value = null;
  }
}

function handleExpandedKeysChange(keys: Array<string | number>): void {
  expandedKeys.value = keys;
}

function handleSelectedKeysChange(keys: Array<string | number>): void {
  const key = keys[0];
  if (typeof key === "string" && key.startsWith("project:")) {
    selectedProjectId.value = key.slice("project:".length);
    return;
  }
  selectedProjectId.value = null;
}

function handleProjectMenuOpen(project: Project | undefined, open: boolean): void {
  if (open && project) {
    selectedProjectId.value = project.id;
  }
}

function handleWorkspaceMenuClick(workspace: Workspace): NonNullable<MenuProps["onClick"]> {
  return ({ key }) => {
    if (key === "create-child") {
      openCreateChildGroup(workspace);
      return;
    }
    if (key === "edit") {
      openEditGroup(workspace);
      return;
    }
    if (key === "delete") {
      askDeleteGroup(workspace);
    }
  };
}

function workspaceMenuItems(workspace: Workspace): MenuProps["items"] {
  return [
    {
      key: "create-child",
      label: t("projectManager.createChildGroup", { name: workspace.name }),
      disabled: props.disabled,
    },
    {
      key: "edit",
      label: t("projectManager.editGroup"),
      disabled: props.disabled,
    },
    { type: "divider" },
    {
      key: "delete",
      label: workspace.locked
        ? t("projectManager.lockedGroupDeleteBlocked")
        : t("projectManager.deleteGroup"),
      danger: true,
      disabled: props.disabled || workspace.locked,
    },
  ];
}

function rootMenuItems(): MenuProps["items"] {
  return [
    {
      key: "create",
      label: t("projectManager.createGroup"),
      disabled: props.disabled,
    },
  ];
}

function handleRootMenuClick(): NonNullable<MenuProps["onClick"]> {
  return ({ key }) => {
    if (key === "create") {
      openCreateRootGroup();
    }
  };
}

function openGroupProject(projectId: string): void {
  if (props.disabled) {
    return;
  }
  selectedProjectId.value = projectId;
  emit("open", projectId);
}

function handleTreeDblClick(_event: MouseEvent, node: unknown): void {
  const groupNode = resolveGroupNode(node);
  if (groupNode?.kind === "project" && groupNode.project) {
    openGroupProject(groupNode.project.id);
  }
}

</script>

<template>
  <Card>
    <template #title>
      <Space>
        <span>{{ t("projectManager.groups") }}</span>
        <Tag>{{ t("projectManager.groupsCount", { count: workspaces.length }) }}</Tag>
      </Space>
    </template>
    <template #extra>
      <Space>
        <Input
          v-model:value="filter"
          :placeholder="t('repo.filter')"
          :disabled="disabled"
          allow-clear
        >
          <template #prefix>
            <Icon name="Search" :size="14" />
          </template>
        </Input>
        <Tooltip :title="t('projectManager.createGroup')">
          <Button :disabled="disabled" @click="openCreateRootGroup">
            <template #icon>
              <Icon name="Plus" :size="16" />
            </template>
          </Button>
        </Tooltip>
      </Space>
    </template>

    <Spin :spinning="loading">
      <div ref="treeHostRef" class="h-[min(560px,calc(100vh-240px))] min-h-80">
        <Tree
          :tree-data="treeData"
          :height="treeHeight || undefined"
          :virtual="treeHeight > 0"
          block-node
          :disabled="disabled"
          :expanded-keys="expandedKeys"
          :selected-keys="selectedKeys"
          @update:expanded-keys="handleExpandedKeysChange"
          @update:selected-keys="handleSelectedKeysChange"
          @dblclick="handleTreeDblClick"
        >
          <template #titleRender="payload">
            <template v-for="node in [resolveGroupNode(payload)]" :key="String(node?.key ?? '')">
              <Dropdown
                v-if="node?.kind === 'root'"
                :trigger="['contextmenu']"
                :disabled="disabled"
                :menu="{ items: rootMenuItems(), onClick: handleRootMenuClick() }"
              >
                <Space>
                  <Icon name="Folder" :size="16" />
                  <span>{{ t("projectManager.rootGroup") }}</span>
                </Space>
              </Dropdown>
              <Dropdown
                v-else-if="node?.workspace"
                :trigger="['contextmenu']"
                :disabled="disabled"
                :menu="{
                  items: workspaceMenuItems(node.workspace),
                  onClick: handleWorkspaceMenuClick(node.workspace),
                }"
              >
                <div class="group/row flex w-full min-w-0 items-center">
                  <Space class="min-w-0 flex-1">
                    <Icon name="Folder" :size="16" />
                    <span class="min-w-0 truncate font-medium">{{ node.workspace.name }}</span>
                  </Space>
                  <Space v-if="!disabled" class="opacity-0 group-hover/row:opacity-100" :size="0">
                    <Tooltip
                      :title="t('projectManager.createChildGroup', { name: node.workspace.name })"
                    >
                      <Button
                        type="text"
                        size="small"
                        @click.stop="openCreateChildGroup(node.workspace)"
                      >
                        <template #icon>
                          <Icon name="Plus" :size="14" />
                        </template>
                      </Button>
                    </Tooltip>
                    <Tooltip :title="t('projectManager.editGroup')">
                      <Button type="text" size="small" @click.stop="openEditGroup(node.workspace)">
                        <template #icon>
                          <Icon name="Pencil" :size="14" />
                        </template>
                      </Button>
                    </Tooltip>
                    <Tooltip
                      :title="
                        node.workspace.locked
                          ? t('projectManager.lockedGroupDeleteBlocked')
                          : t('projectManager.deleteGroup')
                      "
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        :disabled="node.workspace.locked"
                        @click.stop="askDeleteGroup(node.workspace)"
                      >
                        <template #icon>
                          <Icon name="Trash2" :size="14" />
                        </template>
                      </Button>
                    </Tooltip>
                  </Space>
                </div>
              </Dropdown>
              <Dropdown
                v-else-if="node?.project"
                :trigger="['contextmenu']"
                :disabled="disabled"
                :menu="{ items: menuItems, onClick: handleMenuClick(node.project) }"
                @open-change="(open: boolean) => handleProjectMenuOpen(node.project, open)"
              >
                <Space>
                  <Icon :name="node.project.icon" :size="14" />
                  <HighlightText
                    :text="node.project.name"
                    :query="filter"
                    class-name="min-w-0 truncate text-sm font-medium"
                  />
                </Space>
              </Dropdown>
            </template>
          </template>
        </Tree>
      </div>
    </Spin>
  </Card>

  <WorkspaceGroupDialog
    v-if="groupDialog?.mode === 'create'"
    :open="true"
    mode="create"
    :initial-parent-id="groupDialog.parentId"
    @update:open="handleGroupDialogOpen"
  />
  <WorkspaceGroupDialog
    v-if="groupDialog?.mode === 'edit'"
    :open="true"
    mode="edit"
    :workspace="groupDialog.workspace"
    @update:open="handleGroupDialogOpen"
  />

  <ProjectSettingsDialog
    v-if="settingsProject"
    :project="settingsProject"
    :open="true"
    @update:open="handleSettingsOpen"
  />
</template>
