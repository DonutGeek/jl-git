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
} from "antdv-next";
import { useElementSize } from "@vueuse/core";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { WorkspaceGroupDialog } from "@/components/Project";

import { useMessage } from "@/hooks/web/useMessage";
import { useModal } from "@/hooks/web/useModal";
import { useProjectMenu } from "@/hooks/web/useProjectMenu";

import { useProjectStore, useProjectStoreWithOut } from "@/store/modules/project";

import { getProjectCatalogTree } from "@/api/project";

import type { CatalogTreeNode, Project, WorkspaceGroupOpenPayload } from "@/types/project";

defineOptions({ name: "ProjectGroupsTree" });

const emit = defineEmits<{
  open: [projectId: string];
}>();

const { t } = useI18n();
const message = useMessage();
const modal = useModal();
const projectStore = useProjectStore();
const { projects, workspaces } = storeToRefs(projectStore);
const filter = ref("");
const loading = ref(false);
const catalogTree = ref<CatalogTreeNode[]>([]);
const expandedKeys = ref<Array<string | number>>([]);
const selectedProjectId = ref<string | null>(null);
const groupDialogRef = ref<{ open: (payload?: WorkspaceGroupOpenPayload) => void } | null>(null);
const treeHostRef = ref<HTMLElement | null>(null);
const { height: treeHostHeight } = useElementSize(treeHostRef);
const { menuItems, handleMenuClick } = useProjectMenu({
  onOpen: (projectId) => openGroupProject(projectId),
});

let mounted = true;
onMounted(() => {
  loadGroupCatalog();
});
onUnmounted(() => {
  mounted = false;
});

const query = computed(() => filter.value.trim());
const treeHeight = computed(() => Math.max(0, Math.floor(treeHostHeight.value)));
const selectedKeys = computed(() =>
  selectedProjectId.value ? [`project:${selectedProjectId.value}`] : [],
);

/** 拉扁平仓库/分组列表；目录树由下方 watch 绑定后端 DTO */
async function loadGroupCatalog(): Promise<void> {
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

async function loadCatalogTree(): Promise<void> {
  try {
    catalogTree.value = await getProjectCatalogTree(query.value);
  } catch (error) {
    if (mounted) {
      message.error(error);
    }
  }
}

watch([projects, workspaces, query], () => {
  loadCatalogTree();
});

/** 收集所有可展开节点，结构变化时整树展开 */
function collectExpandableKeys(nodes: CatalogTreeNode[]): Array<string | number> {
  const keys: Array<string | number> = [];
  for (const node of nodes) {
    if (node.children.length > 0) {
      keys.push(node.key);
      keys.push(...collectExpandableKeys(node.children));
    }
  }
  return keys;
}

watch(
  catalogTree,
  (nodes, previous) => {
    const nextSignature = collectExpandableKeys(nodes).join("|");
    const previousSignature = previous ? collectExpandableKeys(previous).join("|") : "";
    if (nextSignature !== previousSignature) {
      expandedKeys.value = collectExpandableKeys(nodes);
    }
  },
  { immediate: true },
);

/** titleRender / 双击拿到的可能是节点或包了一层 data */
function resolveGroupNode(payload: unknown): CatalogTreeNode | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (record.kind === "workspace" || record.kind === "project") {
    return payload as CatalogTreeNode;
  }
  const nested = record.data;
  if (nested && typeof nested === "object" && "kind" in nested) {
    return nested as CatalogTreeNode;
  }
  return null;
}

function toGroupPayload(node: CatalogTreeNode): WorkspaceGroupOpenPayload {
  return {
    id: node.id,
    parentId: node.parentId,
    name: node.name,
    icon: node.icon,
    color: node.color,
    locked: node.locked,
  };
}

/** 在根下新建分组 */
function openCreateRootGroup(): void {
  groupDialogRef.value?.open();
}

/** 在指定分组下新建子分组 */
function openCreateChildGroup(node: CatalogTreeNode): void {
  groupDialogRef.value?.open({ parentId: node.id });
}

/** 打开编辑分组弹窗 */
function openEditGroup(node: CatalogTreeNode): void {
  groupDialogRef.value?.open(toGroupPayload(node));
}

/** 锁定分组直接提示；否则二次确认后删除 */
function askDeleteGroup(node: CatalogTreeNode): void {
  if (node.locked) {
    message.error(t("projectManager.lockedGroupDeleteBlocked"));
    return;
  }
  modal.confirm({
    title: t("projectManager.deleteGroupTitle"),
    content: t("projectManager.deleteGroupQuestion", { name: node.name }),
    icon: null,
    okType: "danger",
    okText: t("projectManager.deleteGroupAction"),
    async onOk() {
      try {
        await useProjectStoreWithOut().removeWorkspace(node.id);
        message.success(t("projectManager.deleteGroupSuccess", { name: node.name }));
      } catch (error) {
        message.error(error);
        throw error;
      }
    },
  });
}

/** 同步 Tree 展开状态 */
function handleExpandedKeysChange(keys: Array<string | number>): void {
  expandedKeys.value = keys;
}

/** 只把仓库节点记为选中，分组/根不选 */
function handleSelectedKeysChange(keys: Array<string | number>): void {
  const key = keys[0];
  if (typeof key === "string" && key.startsWith("project:")) {
    selectedProjectId.value = key.slice("project:".length);
    return;
  }
  selectedProjectId.value = null;
}

/** 右键打开仓库菜单时同步选中该行 */
function handleProjectMenuOpen(projectId: string, open: boolean): void {
  if (open) {
    selectedProjectId.value = projectId;
  }
}

/** 分组右键：新建子分组 / 编辑 / 删除 */
function handleWorkspaceMenuClick(node: CatalogTreeNode): NonNullable<MenuProps["onClick"]> {
  return ({ key }) => {
    if (key === "create-child") {
      openCreateChildGroup(node);
      return;
    }
    if (key === "edit") {
      openEditGroup(node);
      return;
    }
    if (key === "delete") {
      askDeleteGroup(node);
    }
  };
}

/** 分组右键菜单项 */
function workspaceMenuItems(node: CatalogTreeNode): MenuProps["items"] {
  return [
    {
      key: "create-child",
      label: t("projectManager.createChildGroup", { name: node.name }),
    },
    {
      key: "edit",
      label: t("projectManager.editGroup"),
    },
    { type: "divider" },
    {
      key: "delete",
      label: node.locked
        ? t("projectManager.lockedGroupDeleteBlocked")
        : t("projectManager.deleteGroup"),
      danger: true,
    },
  ];
}

function projectById(id: string): Project | undefined {
  return projectStore.findById(id);
}

function handleProjectNodeMenuClick(projectId: string): NonNullable<MenuProps["onClick"]> {
  return (info) => {
    const project = projectById(projectId);
    if (!project) {
      return;
    }
    handleMenuClick(project)(info);
  };
}

/** 从分组树打开仓库 */
function openGroupProject(projectId: string): void {
  selectedProjectId.value = projectId;
  emit("open", projectId);
}

/** 双击仓库节点打开 */
function handleTreeDblClick(_event: MouseEvent, node: unknown): void {
  const groupNode = resolveGroupNode(node);
  if (groupNode?.kind === "project") {
    openGroupProject(groupNode.id);
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
        <Input v-model:value="filter" :placeholder="t('repo.filter')" allow-clear>
          <template #prefix>
            <Icon name="Search" :size="14" />
          </template>
        </Input>
        <Tooltip :title="t('projectManager.createGroup')">
          <Button @click="openCreateRootGroup">
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
          :tree-data="catalogTree"
          :field-names="{ title: 'name', key: 'key', children: 'children' }"
          :height="treeHeight || undefined"
          :virtual="treeHeight > 0"
          block-node
          :expanded-keys="expandedKeys"
          :selected-keys="selectedKeys"
          @update:expanded-keys="handleExpandedKeysChange"
          @update:selected-keys="handleSelectedKeysChange"
          @dblclick="handleTreeDblClick"
        >
          <template #titleRender="payload">
            <template v-for="node in [resolveGroupNode(payload)]" :key="String(node?.key ?? '')">
              <Dropdown
                v-if="node?.kind === 'workspace'"
                :trigger="['contextmenu']"
                :menu="{
                  items: workspaceMenuItems(node),
                  onClick: handleWorkspaceMenuClick(node),
                }"
              >
                <div class="group/row flex w-full min-w-0 items-center">
                  <Space class="min-w-0 flex-1">
                    <Icon name="Folder" :size="16" />
                    <span class="min-w-0 truncate font-medium">{{ node.name }}</span>
                  </Space>
                  <Space class="opacity-0 group-hover/row:opacity-100" :size="0">
                    <Tooltip :title="t('projectManager.createChildGroup', { name: node.name })">
                      <Button type="text" size="small" @click.stop="openCreateChildGroup(node)">
                        <template #icon>
                          <Icon name="Plus" :size="14" />
                        </template>
                      </Button>
                    </Tooltip>
                    <Tooltip :title="t('projectManager.editGroup')">
                      <Button type="text" size="small" @click.stop="openEditGroup(node)">
                        <template #icon>
                          <Icon name="Pencil" :size="14" />
                        </template>
                      </Button>
                    </Tooltip>
                    <Tooltip
                      :title="
                        node.locked
                          ? t('projectManager.lockedGroupDeleteBlocked')
                          : t('projectManager.deleteGroup')
                      "
                    >
                      <Button type="text" size="small" danger @click.stop="askDeleteGroup(node)">
                        <template #icon>
                          <Icon name="Trash2" :size="14" />
                        </template>
                      </Button>
                    </Tooltip>
                  </Space>
                </div>
              </Dropdown>
              <Dropdown
                v-else-if="node?.kind === 'project'"
                :trigger="['contextmenu']"
                :menu="{ items: menuItems, onClick: handleProjectNodeMenuClick(node.id) }"
                @open-change="(open: boolean) => handleProjectMenuOpen(node.id, open)"
              >
                <Space>
                  <Icon v-if="node.icon" :name="node.icon" :size="14" />
                  <span class="min-w-0 truncate text-sm font-medium">{{ node.name }}</span>
                </Space>
              </Dropdown>
            </template>
          </template>
        </Tree>
      </div>
    </Spin>
  </Card>

  <WorkspaceGroupDialog ref="groupDialogRef" />
</template>
