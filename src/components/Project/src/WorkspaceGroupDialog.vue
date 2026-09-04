<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";

import { Button, ColorPicker, Col, Form, FormItem, Input, Modal, Row, Select } from "antdv-next";
import { useI18n } from "vue-i18n";

import { DEFAULT_WORKSPACE_ICON } from "./workspaceGroupAppearance";

import { useMessage } from "@/hooks/web/useMessage";

import { useProjectStore, useProjectStoreWithOut } from "@/store/modules/project";

import {
  DEFAULT_WORKSPACE_COLOR,
  WORKSPACE_COLOR_PRESETS,
  normalizeWorkspaceColor,
} from "@/utils/workspaceColor";
import { buildWorkspaceOptions, collectWorkspaceSubtreeIds } from "@/utils/workspaceOptions";

import { toUserMessage } from "@/types/error";
import type { ColorValueType } from "antdv-next";
import type { Workspace, WorkspaceColor, WorkspaceIcon } from "@/types/project";

defineOptions({ name: "WorkspaceGroupDialog" });

const props = withDefaults(
  defineProps<{
    open: boolean;
    mode: "create" | "edit";
    initialParentId?: string | null;
    workspace?: Workspace | null;
  }>(),
  { initialParentId: null, workspace: null },
);

const emit = defineEmits<{
  "update:open": [open: boolean];
  created: [workspace: Workspace];
  updated: [workspace: Workspace];
}>();

const { t } = useI18n();
const message = useMessage();
const projectStore = useProjectStore();
const { workspaces } = storeToRefs(projectStore);
const name = ref("");
const parentId = ref("");
const icon = ref<WorkspaceIcon>(DEFAULT_WORKSPACE_ICON);
const color = ref<WorkspaceColor>(DEFAULT_WORKSPACE_COLOR);
const saving = ref(false);
const error = ref<string | null>(null);

const parentExcludeIds = computed(() => {
  if (props.mode !== "edit" || !props.workspace) {
    return new Set<string>();
  }
  return collectWorkspaceSubtreeIds(workspaces.value, props.workspace.id);
});

const parentOptions = computed(() => [
  { value: "", label: t("projectManager.rootGroup") },
  ...buildWorkspaceOptions(workspaces.value, parentExcludeIds.value),
]);

const colorPresets = computed(() => [
  {
    label: t("projectManager.groupColorPresets"),
    colors: [...WORKSPACE_COLOR_PRESETS],
    defaultOpen: true,
  },
]);

const iconOptions = computed(() => [
  { value: "code", label: t("projectManager.iconCode") },
  { value: "folder", label: t("projectManager.iconFolder") },
  { value: "briefcase", label: t("projectManager.iconBriefcase") },
  { value: "layers", label: t("projectManager.iconLayers") },
  { value: "box", label: t("projectManager.iconBox") },
]);

const title = computed(() =>
  props.mode === "edit" ? t("projectManager.editGroup") : t("projectManager.createGroup"),
);

watch(
  () => [props.open, props.mode, props.workspace, props.initialParentId] as const,
  ([open]) => {
    if (!open) {
      return;
    }
    error.value = null;
    saving.value = false;
    if (props.mode === "edit" && props.workspace) {
      name.value = props.workspace.name;
      parentId.value = props.workspace.parentId ?? "";
      icon.value = props.workspace.icon;
      color.value = normalizeWorkspaceColor(props.workspace.color);
      return;
    }
    name.value = "";
    parentId.value = props.initialParentId ?? "";
    icon.value = DEFAULT_WORKSPACE_ICON;
    color.value = DEFAULT_WORKSPACE_COLOR;
  },
);

function handleColorChange(next: ColorValueType): void {
  if (typeof next === "string") {
    color.value = normalizeWorkspaceColor(next);
    return;
  }
  if (next && typeof next === "object" && "toHexString" in next) {
    color.value = normalizeWorkspaceColor(next.toHexString());
  }
}

function handleOpenChange(next: boolean): void {
  if (!next && saving.value) {
    return;
  }
  emit("update:open", next);
}

async function handleSubmit(): Promise<void> {
  const nextName = name.value.trim();
  if (!nextName || saving.value) {
    return;
  }

  saving.value = true;
  error.value = null;
  try {
    if (props.mode === "edit" && props.workspace) {
      const workspace = await useProjectStoreWithOut().updateWorkspace({
        id: props.workspace.id,
        name: nextName,
        ...(props.workspace.locked ? {} : { parentId: parentId.value || null }),
        icon: icon.value,
        color: color.value,
      });
      message.success(t("projectManager.editGroupSuccess"));
      emit("updated", workspace);
    } else {
      const workspace = await useProjectStoreWithOut().createWorkspace(
        nextName,
        parentId.value || undefined,
        icon.value,
        color.value,
      );
      message.success(t("projectManager.createGroupSuccess"));
      emit("created", workspace);
    }
    emit("update:open", false);
  } catch (submitError) {
    error.value = toUserMessage(submitError);
    message.error(submitError);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    :ok-text="mode === 'edit' ? t('projectManager.saveGroup') : t('projectManager.createGroup')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: !name.trim() || saving }"
    @update:open="handleOpenChange"
    @ok="handleSubmit"
  >
    <Form layout="vertical">
      <Row :gutter="16">
        <Col :span="24">
          <FormItem :label="t('projectManager.groupName')" name="name">
            <Input
              v-model:value="name"
              :placeholder="t('projectManager.groupNamePlaceholder')"
              :disabled="saving"
            />
          </FormItem>
        </Col>
        <Col :span="24">
          <FormItem :label="t('projectManager.parentGroup')" name="parentId">
            <Select
              class="w-full"
              :value="parentId"
              :options="parentOptions"
              :disabled="saving || Boolean(workspace?.locked)"
              @update:value="(next) => (parentId = String(next ?? ''))"
            />
          </FormItem>
        </Col>
        <Col :span="12">
          <FormItem :label="t('projectManager.groupIcon')" name="icon">
            <Select
              class="w-full"
              :value="icon"
              :options="iconOptions"
              :disabled="saving"
              @update:value="(next) => (icon = String(next ?? DEFAULT_WORKSPACE_ICON))"
            />
          </FormItem>
        </Col>
        <Col :span="12">
          <FormItem :label="t('projectManager.groupColor')" name="color">
            <ColorPicker
              :value="color"
              format="hex"
              value-format="hex"
              disabled-alpha
              show-text
              :presets="colorPresets"
              :disabled="saving"
              @update:value="handleColorChange"
            />
          </FormItem>
        </Col>
        <Col v-if="error" :span="24">
          <p class="text-destructive text-sm">{{ error }}</p>
        </Col>
      </Row>
    </Form>
    <template #footer>
      <Button :disabled="saving" @click="handleOpenChange(false)">{{ t("common.cancel") }}</Button>
      <Button
        type="primary"
        :disabled="!name.trim() || saving"
        :loading="saving"
        @click="handleSubmit"
      >
        {{ mode === "edit" ? t("projectManager.saveGroup") : t("projectManager.createGroup") }}
      </Button>
    </template>
  </Modal>
</template>
