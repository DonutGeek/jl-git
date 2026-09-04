<script setup lang="ts">
import { computed, ref } from "vue";

import {
  Button,
  ColorPicker,
  Col,
  Form,
  FormItem,
  Input,
  Modal,
  Row,
  TreeSelect,
} from "antdv-next";
import { useI18n } from "vue-i18n";

import { IconPicker } from "@/components/Icon";

import { useForm } from "@/hooks/web/useForm";
import { useMessage } from "@/hooks/web/useMessage";

import { useProjectStoreWithOut } from "@/store/modules/project";

import { getWorkspaceTree } from "@/api/project";
import { WORKSPACE_COLOR_PRESETS, parseWorkspaceColor } from "@/utils/workspaceColor";

import { toUserMessage } from "@/types/error";
import type { ColorValueType } from "antdv-next";
import type { Workspace, WorkspaceGroupOpenPayload, WorkspaceTreeNode } from "@/types/project";

defineOptions({ name: "WorkspaceGroupDialog" });

interface GroupFormState {
  name: string;
  parentId: string;
  icon: string;
  color: string;
}

function createGroupForm(): GroupFormState {
  return {
    name: "",
    parentId: "",
    icon: "",
    color: "",
  };
}

const emit = defineEmits<{
  created: [workspace: Workspace];
  updated: [workspace: Workspace];
}>();

const { t } = useI18n();
const message = useMessage();
const visible = ref(false);
const editingId = ref<string | null>(null);
const parentLocked = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const parentTreeData = ref<WorkspaceTreeNode[]>([]);

const isEdit = computed(() => editingId.value !== null);

/** 已有分组时，新建必须选真实上级；树为空才允许不选（第一个根） */
const parentGroupRequired = computed(() => !isEdit.value && parentTreeData.value.length > 0);

const { form, formInst, rules, resetForm, validate } = useForm(createGroupForm, () => ({
  name: [
    { required: true, whitespace: true, message: () => t("projectManager.groupNameRequired") },
  ],
  ...(parentGroupRequired.value
    ? {
        parentId: [
          {
            required: true,
            whitespace: true,
            message: () => t("projectManager.parentGroupRequired"),
          },
        ],
      }
    : {}),
}));

const colorPresets = computed(() => [
  {
    label: t("projectManager.groupColorPresets"),
    colors: [...WORKSPACE_COLOR_PRESETS],
    defaultOpen: true,
  },
]);

const title = computed(() =>
  isEdit.value ? t("projectManager.editGroup") : t("projectManager.createGroup"),
);

/** 父组件通过 ref 调用；有 id 编辑，否则新建 */
async function open(payload?: WorkspaceGroupOpenPayload): Promise<void> {
  error.value = null;
  saving.value = false;
  if (payload?.id) {
    editingId.value = payload.id;
    parentLocked.value = Boolean(payload.locked);
    resetForm({
      name: payload.name ?? "",
      parentId: payload.parentId ?? "",
      icon: payload.icon ?? "",
      color: payload.color ?? "",
    });
  } else {
    editingId.value = null;
    parentLocked.value = false;
    resetForm({
      parentId: payload?.parentId ?? "",
    });
  }
  try {
    parentTreeData.value = await getWorkspaceTree(payload?.id);
  } catch (loadError) {
    parentTreeData.value = [];
    message.error(loadError);
  }
  visible.value = true;
}

function handleParentChange(next: string | number | null | undefined): void {
  form.parentId = next == null ? "" : String(next);
}

function handleColorClear(): void {
  form.color = "";
}

function handleColorChange(next: ColorValueType): void {
  if (next == null || next === "") {
    form.color = "";
    return;
  }
  if (typeof next === "string") {
    form.color = parseWorkspaceColor(next) ?? "";
    return;
  }
  if (typeof next === "object" && "toHexString" in next) {
    form.color = parseWorkspaceColor(next.toHexString()) ?? "";
  }
}

/** 触发器上的 allow-clear 与 TreeSelect 一样：点清空写成空串，且不要打开取色板 */
function handleColorTriggerClear(event: MouseEvent): void {
  if (!(event.target instanceof Element) || !event.target.closest(".ant-input-clear-icon")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  form.color = "";
}

function handleOpenChange(next: boolean): void {
  visible.value = next;
}

async function handleSubmit(): Promise<void> {
  if (!(await validate())) {
    return;
  }
  if (saving.value) {
    return;
  }

  saving.value = true;
  error.value = null;
  const nextName = form.name.trim();
  const nextParentId = form.parentId || null;
  try {
    if (editingId.value) {
      const workspace = await useProjectStoreWithOut().updateWorkspace({
        id: editingId.value,
        name: nextName,
        ...(parentLocked.value ? {} : { parentId: nextParentId }),
        icon: form.icon,
        color: form.color,
      });
      message.success(t("projectManager.editGroupSuccess"));
      emit("updated", workspace);
    } else {
      const workspace = await useProjectStoreWithOut().createWorkspace(
        nextName,
        nextParentId ?? undefined,
        form.icon,
        form.color,
      );
      message.success(t("projectManager.createGroupSuccess"));
      emit("created", workspace);
    }
    visible.value = false;
  } catch (submitError) {
    error.value = toUserMessage(submitError);
    message.error(submitError);
  } finally {
    saving.value = false;
  }
}

defineExpose({ open });
</script>

<template>
  <Modal
    :open="visible"
    :title="title"
    :ok-text="isEdit ? t('projectManager.saveGroup') : t('projectManager.createGroup')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="saving"
    @update:open="handleOpenChange"
  >
    <Form :ref="formInst" :model="form" :rules="rules" layout="vertical">
      <Row :gutter="16">
        <Col :span="24">
          <FormItem :label="t('projectManager.groupName')" name="name" required>
            <Input
              v-model:value="form.name"
              :placeholder="t('projectManager.groupNamePlaceholder')"
            />
          </FormItem>
        </Col>
        <Col :span="24">
          <FormItem
            :label="t('projectManager.parentGroup')"
            name="parentId"
            :required="parentGroupRequired"
          >
            <TreeSelect
              class="w-full"
              :value="form.parentId || undefined"
              :tree-data="parentTreeData"
              :field-names="{ label: 'name', value: 'id', children: 'children' }"
              :placeholder="t('common.pleaseSelect')"
              allow-clear
              tree-default-expand-all
              :disabled="parentLocked"
              @update:value="handleParentChange"
            />
          </FormItem>
        </Col>
        <Col :span="12">
          <FormItem :label="t('projectManager.groupIcon')" name="icon">
            <IconPicker v-model:value="form.icon" />
          </FormItem>
        </Col>
        <Col :span="12">
          <FormItem :label="t('projectManager.groupColor')" name="color">
            <ColorPicker
              class="w-full"
              :value="form.color || undefined"
              format="hex"
              value-format="hex"
              disabled-alpha
              allow-clear
              :presets="colorPresets"
              @update:value="handleColorChange"
              @clear="handleColorClear"
            >
              <Input
                class="w-full"
                :value="form.color"
                readonly
                allow-clear
                :placeholder="t('common.pleaseSelect')"
                @mousedown.capture="handleColorTriggerClear"
                @click.capture="handleColorTriggerClear"
              >
                <template v-if="form.color" #prefix>
                  <span
                    class="inline-block size-4 rounded-sm border"
                    :style="{ backgroundColor: form.color }"
                  />
                </template>
              </Input>
            </ColorPicker>
          </FormItem>
        </Col>
        <Col v-if="error" :span="24">
          <p class="text-destructive text-sm">{{ error }}</p>
        </Col>
      </Row>
    </Form>
    <template #footer>
      <Button @click="handleOpenChange(false)">{{ t("common.cancel") }}</Button>
      <Button type="primary" :loading="saving" @click="handleSubmit">
        {{ isEdit ? t("projectManager.saveGroup") : t("projectManager.createGroup") }}
      </Button>
    </template>
  </Modal>
</template>
