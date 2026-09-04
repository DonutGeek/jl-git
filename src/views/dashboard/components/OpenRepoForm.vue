<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";

import {
  Button,
  Card,
  Col,
  Flex,
  Form,
  FormItem,
  Input,
  Row,
  Space,
  SpaceCompact,
  Tooltip,
  TreeSelect,
} from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon, IconPicker } from "@/components/Icon";
import { ExistingProjectDialog, WorkspaceGroupDialog } from "@/components/Project";

import { useForm } from "@/hooks/web/useForm";
import { useMessage } from "@/hooks/web/useMessage";

import { useProjectStore } from "@/store/modules/project";

import { pickProjectDirectory } from "@/api/project";

import type {
  ExistingProjectOpenPayload,
  Project,
  Workspace,
  WorkspaceGroupOpenPayload,
} from "@/types/project";

defineOptions({ name: "OpenRepoForm" });

interface OpenRepoFormState {
  path: string;
  alias: string;
  icon: string;
  workspaceId: string;
  description: string;
}

function createOpenForm(): OpenRepoFormState {
  return {
    path: "",
    alias: "",
    icon: "",
    workspaceId: "",
    description: "",
  };
}

const emit = defineEmits<{
  open: [projectId: string];
}>();

const { t } = useI18n();
const message = useMessage();
const projectStore = useProjectStore();
const { workspaceTree } = storeToRefs(projectStore);
const { form, formInst, rules, resetForm, validate } = useForm(createOpenForm, () => ({
  path: [{ required: true, whitespace: true, message: () => t("openRepo.pathRequired") }],
}));
const groupDialogRef = ref<{ open: (payload?: WorkspaceGroupOpenPayload) => void } | null>(null);
const existingDialogRef = ref<{ open: (payload: ExistingProjectOpenPayload) => void } | null>(null);
const opening = ref(false);
const picking = ref(false);

let mounted = true;
onMounted(() => {
  loadWorkspaces();
});
onUnmounted(() => {
  mounted = false;
});

/** 拉分组树，供仓库分组 TreeSelect 使用 */
async function loadWorkspaces() {
  try {
    await projectStore.loadWorkspaces();
  } catch (error) {
    if (mounted) {
      message.error(error);
    }
  }
}

/** 空字符串不能当 TreeSelect 选中值，未选分组时不传 value */
function handleWorkspaceChange(next: string | number | null | undefined): void {
  form.workspaceId = next == null ? "" : String(next);
}

/** 新建分组成功后选中该分组 */
function handleCreatedGroup(workspace: Workspace): void {
  form.workspaceId = workspace.id;
}

/** 打开新建分组弹窗 */
function openCreateGroup(): void {
  groupDialogRef.value?.open();
}

/** 改路径，不回填别名 */
function handlePathChange(value: string): void {
  form.path = value;
}

/** 系统选目录；进行中再点直接拦截，避免叠两个原生框 */
async function pickPath(): Promise<void> {
  if (picking.value) {
    return;
  }
  const pickPromise = pickProjectDirectory();
  picking.value = true;
  try {
    const selected = await pickPromise;
    if (selected) {
      handlePathChange(selected);
    }
  } catch (error) {
    message.error(error);
  } finally {
    picking.value = false;
  }
}

/** 登记成功后清空表单 */
function resetOpenForm(): void {
  resetForm();
}

function openPayload() {
  return {
    path: form.path.trim(),
    name: form.alias.trim() || undefined,
    workspaceId: form.workspaceId || undefined,
    description: form.description.trim() || undefined,
    icon: form.icon || undefined,
  };
}

/** 登记并打开；校验由 Form rules 负责，重复提交在方法内拦截 */
async function submitOpen(): Promise<void> {
  if (opening.value) {
    return;
  }
  opening.value = true;
  try {
    const result = await projectStore.addAndOpen(openPayload());
    if (result.alreadyExists) {
      existingDialogRef.value?.open({ project: result.project });
      return;
    }
    resetOpenForm();
    emit("open", result.project.id);
  } catch (error) {
    message.error(error);
  } finally {
    opening.value = false;
  }
}

/** 只登记不打开，方便连续导入 */
async function saveAndContinue(): Promise<void> {
  if (!(await validate())) {
    return;
  }
  if (opening.value) {
    return;
  }
  opening.value = true;
  try {
    const result = await projectStore.addProject(openPayload());
    if (result.alreadyExists) {
      existingDialogRef.value?.open({ project: result.project });
      return;
    }
    resetOpenForm();
    message.success(t("openRepo.success", { name: result.project.name }));
  } catch (error) {
    message.error(error);
  } finally {
    opening.value = false;
  }
}

/** 路径已登记过，打开已有项目 */
async function confirmExistingProject(project: Project): Promise<void> {
  resetOpenForm();
  try {
    await projectStore.openExisting(project.id);
    emit("open", project.id);
  } catch (error) {
    message.error(error);
  }
}
</script>

<template>
  <Card>
    <template #title>{{ t("openRepo.title") }}</template>
    <Form :ref="formInst" :model="form" :rules="rules" layout="vertical" @finish="submitOpen">
      <Row :gutter="16">
        <Col :span="24">
          <FormItem :label="t('openRepo.pathLabel')" name="path" required>
            <SpaceCompact block>
              <Input
                :value="form.path"
                :placeholder="t('openRepo.pathPlaceholder')"
                autocomplete="off"
                @update:value="handlePathChange"
              />
              <Button @click="pickPath">
                <template #icon>
                  <Icon name="FolderOpen" :size="16" />
                </template>
                {{ t("openRepo.pickButton") }}
              </Button>
            </SpaceCompact>
          </FormItem>
        </Col>
        <Col :span="24">
          <FormItem :label="t('openRepo.aliasLabel')" name="alias">
            <Input
              v-model:value="form.alias"
              :placeholder="t('openRepo.aliasPlaceholder')"
              autocomplete="off"
            />
          </FormItem>
        </Col>
        <Col :xs="24" :sm="12">
          <FormItem :label="t('projectManager.projectIcon')" name="icon">
            <IconPicker v-model:value="form.icon" />
          </FormItem>
        </Col>
        <Col :xs="24" :sm="12">
          <FormItem :label="t('projectManager.workspaceLabel')" name="workspaceId">
            <Flex class="w-full" align="center" gap="small">
              <TreeSelect
                class="min-w-0 flex-1"
                :value="form.workspaceId || undefined"
                :tree-data="workspaceTree"
                :field-names="{ label: 'name', value: 'id', children: 'children' }"
                :placeholder="t('common.pleaseSelect')"
                allow-clear
                tree-default-expand-all
                @update:value="handleWorkspaceChange"
              />
              <Tooltip :title="t('projectManager.createGroup')">
                <Button @click="openCreateGroup">
                  <template #icon>
                    <Icon name="Plus" :size="16" />
                  </template>
                </Button>
              </Tooltip>
            </Flex>
          </FormItem>
        </Col>
        <Col :span="24">
          <FormItem :label="t('openRepo.detailLabel')" name="description">
            <Input.TextArea
              v-model:value="form.description"
              :rows="4"
              :placeholder="t('openRepo.detailPlaceholder')"
            />
          </FormItem>
        </Col>
        <Col :span="24">
          <FormItem>
            <Space>
              <Button type="primary" html-type="submit" :loading="opening">
                {{ t("openRepo.submitButton") }}
              </Button>
              <Button :loading="opening" @click="saveAndContinue">
                {{ t("openRepo.saveAndContinue") }}
              </Button>
            </Space>
          </FormItem>
        </Col>
      </Row>
    </Form>
  </Card>

  <WorkspaceGroupDialog ref="groupDialogRef" @created="handleCreatedGroup" />

  <ExistingProjectDialog ref="existingDialogRef" @confirm="confirmExistingProject" />
</template>
