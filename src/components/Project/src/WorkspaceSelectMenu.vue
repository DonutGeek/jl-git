<script setup lang="ts">
import { computed, ref } from "vue";

import { Button, Select } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import WorkspaceGroupDialog from "./WorkspaceGroupDialog.vue";
import { useZustand } from "@/hooks/core/useZustand";
import { useProjectStore } from "@/store/modules/project";
import type { Workspace } from "@/types/project";
import { buildWorkspaceOptions } from "@/utils/workspaceOptions";

defineOptions({ name: "WorkspaceSelectMenu" });

const props = withDefaults(
  defineProps<{
    value: string;
    selectLabel: string;
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
const workspaces = useZustand(useProjectStore, (state) => state.workspaces);
const createOpen = ref(false);

const resolvedEmptyLabel = computed(() => props.emptyLabel ?? t("projectManager.ungrouped"));

const options = computed(() => {
  const treeOptions = buildWorkspaceOptions(workspaces.value, props.excludeIds ?? new Set());
  if (!props.includeEmpty) {
    return treeOptions;
  }
  return [{ value: "", label: resolvedEmptyLabel.value }, ...treeOptions];
});

function openCreateDialog(): void {
  createOpen.value = true;
}

function handleCreated(workspace: Workspace): void {
  emit("update:value", workspace.id);
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1">
    <Select
      class="w-full"
      :value="value"
      :options="options"
      :disabled="disabled"
      :aria-label="selectLabel"
      @update:value="(next) => emit('update:value', String(next ?? ''))"
    />
    <Button
      v-if="allowQuickAdd"
      type="link"
      size="small"
      class="h-8 justify-start px-1"
      :disabled="disabled"
      @click="openCreateDialog"
    >
      <Icon name="Plus" :size="14" />
      {{ t("projectManager.quickAddGroup") }}
    </Button>
    <WorkspaceGroupDialog
      v-if="allowQuickAdd"
      :open="createOpen"
      mode="create"
      @update:open="(next: boolean) => (createOpen = next)"
      @created="handleCreated"
    />
  </div>
</template>
