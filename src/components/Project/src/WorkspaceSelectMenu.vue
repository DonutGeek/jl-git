<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";

import { Button, Divider, Select } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import WorkspaceGroupDialog from "./WorkspaceGroupDialog.vue";

import { useMessage } from "@/hooks/web/useMessage";

import { useProjectStore } from "@/store/modules/project";

import { buildWorkspaceOptions } from "@/utils/workspaceOptions";

import type { Workspace } from "@/types/project";

defineOptions({ name: "WorkspaceSelectMenu" });

const props = withDefaults(
  defineProps<{
    value: string;
    disabled?: boolean;
    emptyLabel?: string;
    includeEmpty?: boolean;
    excludeIds?: ReadonlySet<string>;
    allowQuickAdd?: boolean;
  }>(),
  {
    disabled: false,
    emptyLabel: undefined,
    includeEmpty: true,
    excludeIds: undefined,
    allowQuickAdd: true,
  },
);

const emit = defineEmits<{
  "update:value": [value: string];
}>();

const { t } = useI18n();
const message = useMessage();
const projectStore = useProjectStore();
const { workspaces } = storeToRefs(projectStore);
const createOpen = ref(false);

let mounted = true;
onMounted(() => {
  loadWorkspaces();
});
onUnmounted(() => {
  mounted = false;
});

async function loadWorkspaces() {
  try {
    await projectStore.loadWorkspaces();
  } catch (error) {
    if (mounted) {
      message.error(error);
    }
  }
}

const resolvedEmptyLabel = computed(() => props.emptyLabel ?? t("projectManager.ungrouped"));

const options = computed(() => {
  const treeOptions = buildWorkspaceOptions(workspaces.value, props.excludeIds ?? new Set());
  if (!props.includeEmpty) {
    return treeOptions;
  }
  return [{ value: "", label: resolvedEmptyLabel.value }, ...treeOptions];
});

function resolveMenuNode(menu: unknown) {
  if (menu && typeof menu === "object" && "menuNode" in menu) {
    return (menu as { menuNode: unknown }).menuNode;
  }
  return menu;
}

function preventSelectBlur(event: Event): void {
  event.preventDefault();
}

function openCreateDialog(): void {
  createOpen.value = true;
}

function handleCreated(workspace: Workspace): void {
  emit("update:value", workspace.id);
}

function handleCreateOpen(open: boolean): void {
  createOpen.value = open;
}
</script>

<template>
  <Select
    class="w-full"
    :value="value"
    :options="options"
    :disabled="disabled"
    @update:value="(next) => emit('update:value', String(next ?? ''))"
  >
    <template v-if="allowQuickAdd" #popupRender="menu">
      <div>
        <component :is="resolveMenuNode(menu)" />
        <Divider style="margin: 4px 0" />
        <div class="px-2 py-1" @mousedown="preventSelectBlur">
          <Button type="text" size="small" class="w-full justify-start" @click="openCreateDialog">
            <template #icon>
              <Icon name="Plus" :size="14" />
            </template>
            {{ t("projectManager.quickAddGroup") }}
          </Button>
        </div>
      </div>
    </template>
  </Select>
  <WorkspaceGroupDialog
    v-if="allowQuickAdd"
    :open="createOpen"
    mode="create"
    @update:open="handleCreateOpen"
    @created="handleCreated"
  />
</template>
