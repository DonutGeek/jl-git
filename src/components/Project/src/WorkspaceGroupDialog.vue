<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { Button, Col, Form, FormItem, Input, Modal, Row, Select, message } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { DEFAULT_WORKSPACE_ICON } from "./workspaceGroupAppearance";
import { useZustand } from "@/hooks/core/useZustand";
import { useProjectStore, useProjectStoreWithOut } from "@/store/modules/project";
import { toUserMessage } from "@/types/error";
import type { Workspace, WorkspaceColor, WorkspaceIcon } from "@/types/project";
import {
  DEFAULT_WORKSPACE_COLOR,
  WORKSPACE_COLOR_PRESETS,
  normalizeWorkspaceColor,
} from "@/utils/workspaceColor";
import { buildWorkspaceOptions, collectWorkspaceSubtreeIds } from "@/utils/workspaceOptions";

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
const workspaces = useZustand(useProjectStore, (state) => state.workspaces);
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

const iconOptions = computed(() => [
  { value: "code", label: t("projectManager.iconCode") },
  { value: "folder", label: t("projectManager.iconFolder") },
  { value: "briefcase", label: t("projectManager.iconBriefcase") },
  { value: "layers", label: t("projectManager.iconLayers") },
  { value: "box", label: t("projectManager.iconBox") },
]);

const parentName = computed(() =>
  parentId.value ? workspaces.value.find((item) => item.id === parentId.value)?.name : null,
);

const title = computed(() =>
  props.mode === "edit" ? t("projectManager.editGroup") : t("projectManager.createGroup"),
);

const description = computed(() => {
  if (props.mode === "edit") {
    return t("projectManager.editGroupDescription");
  }
  if (parentName.value) {
    return t("projectManager.createChildGroup", { name: parentName.value });
  }
  return t("projectManager.groupName");
});

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
    const nextMessage = toUserMessage(submitError);
    error.value = nextMessage;
    message.error(nextMessage);
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
    @ok="void handleSubmit()"
  >
    <p class="text-muted-foreground mb-4 text-sm">{{ description }}</p>
    <Form layout="vertical">
      <Row :gutter="16">
        <Col :span="24">
          <FormItem :label="t('projectManager.groupName')" name="name">
            <Input
              id="workspace-group-dialog-name"
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
            <div class="flex flex-wrap gap-2 pt-1">
              <button
                v-for="preset in WORKSPACE_COLOR_PRESETS"
                :key="preset"
                type="button"
                class="size-6 rounded-full border-2"
                :class="color === preset ? 'border-foreground' : 'border-transparent'"
                :style="{ backgroundColor: preset }"
                :aria-label="t('projectManager.groupColor')"
                :disabled="saving"
                @click="color = preset"
              />
            </div>
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
        @click="void handleSubmit()"
      >
        <Icon v-if="saving" name="LoaderCircle" :size="14" class="mr-1 animate-spin" />
        {{ mode === "edit" ? t("projectManager.saveGroup") : t("projectManager.createGroup") }}
      </Button>
    </template>
  </Modal>
</template>
