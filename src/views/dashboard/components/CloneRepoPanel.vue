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
import { WorkspaceGroupDialog } from "@/components/Project";

import ExistingRemoteCloneDialog from "./ExistingRemoteCloneDialog.vue";

import { useForm } from "@/hooks/web/useForm";
import { useMessage } from "@/hooks/web/useMessage";

import { useProjectStore } from "@/store/modules/project";

import { checkProjectUniqueness, pickProjectDirectory } from "@/api/project";
import { cloneRepository } from "@/api/git/clone";
import { joinCloneDestPath, repoNameFromCloneUrl } from "@/utils/gitClonePath";

import type { ProjectRemoteMatch, Workspace, WorkspaceGroupOpenPayload } from "@/types/project";

defineOptions({ name: "CloneRepoPanel" });

interface CloneRepoFormState {
  url: string;
  path: string;
  alias: string;
  icon: string;
  workspaceId: string;
}

function createCloneForm(): CloneRepoFormState {
  return {
    url: "",
    path: "",
    alias: "",
    icon: "",
    workspaceId: "",
  };
}

const emit = defineEmits<{
  open: [projectId: string];
}>();

const { t } = useI18n();
const message = useMessage();
const projectStore = useProjectStore();
const { workspaceTree } = storeToRefs(projectStore);
const { form, formInst, rules, resetForm, validate } = useForm(createCloneForm, () => ({
  url: [{ required: true, whitespace: true, message: () => t("cloneRepo.urlRequired") }],
  path: [{ required: true, whitespace: true, message: () => t("cloneRepo.pathRequired") }],
}));
const suggestedRepoName = ref("");
const groupDialogRef = ref<{ open: (payload?: WorkspaceGroupOpenPayload) => void } | null>(null);
const remoteDialogRef = ref<{
  open: (matches: ProjectRemoteMatch[], openAfter?: boolean) => void;
} | null>(null);
const cloning = ref(false);
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

/** 新建分组成功后选中该分组 */
function handleCreatedGroup(workspace: Workspace): void {
  form.workspaceId = workspace.id;
}

/** 打开新建分组弹窗 */
function openCreateGroup(): void {
  groupDialogRef.value?.open();
}

/** 克隆成功后清空表单 */
function resetCloneForm(): void {
  resetForm();
  suggestedRepoName.value = "";
}

/** 改远端地址；仓库名只用于拼接存放路径，不回填别名 */
function handleUrlChange(nextUrl: string): void {
  form.url = nextUrl;
  suggestedRepoName.value = repoNameFromCloneUrl(nextUrl);
}

/** 选父目录，再拼上仓库名作为存放路径 */
async function pickParentDirectory(): Promise<void> {
  if (picking.value) {
    return;
  }
  const pickPromise = pickProjectDirectory();
  picking.value = true;
  try {
    const selected = await pickPromise;
    if (!selected) {
      return;
    }
    const name = suggestedRepoName.value || repoNameFromCloneUrl(form.url);
    suggestedRepoName.value = name;
    form.path = joinCloneDestPath(selected, name);
  } catch (error) {
    message.error(error);
  } finally {
    picking.value = false;
  }
}

/** 克隆并登记。openAfter 为 false 时只登记不打开 */
async function runClone(openAfter: boolean, skipRemoteWarn = false): Promise<void> {
  if (cloning.value) {
    return;
  }

  cloning.value = true;
  try {
    const remoteUrl = form.url.trim();
    const destPath = form.path.trim();
    const name = form.alias.trim() || undefined;
    const nextWorkspaceId = form.workspaceId || undefined;
    const icon = form.icon || undefined;

    if (!skipRemoteWarn) {
      try {
        const uniqueness = await checkProjectUniqueness({ remoteUrl });
        if (uniqueness.kind === "existingRemote" && uniqueness.matches.length > 0) {
          remoteDialogRef.value?.open(uniqueness.matches, openAfter);
          return;
        }
      } catch (error) {
        console.warn("remote uniqueness check skipped", error);
      }
    }

    const cloned = await cloneRepository(remoteUrl, destPath);
    const input = {
      path: cloned.path,
      name,
      workspaceId: nextWorkspaceId,
      icon,
    };
    const result = openAfter
      ? await projectStore.addAndOpen(input)
      : await projectStore.addProject(input);

    resetCloneForm();
    message.success(t("cloneRepo.success", { name: result.project.name }));
    if (openAfter) {
      emit("open", result.project.id);
    }
  } catch (error) {
    message.error(error);
  } finally {
    cloning.value = false;
  }
}

/** 主按钮：Form 校验通过后克隆并打开 */
async function submitClone(): Promise<void> {
  await runClone(true);
}

/** 次按钮：先走同一套校验，再只登记不打开 */
async function cloneAndContinue(): Promise<void> {
  if (!(await validate())) {
    return;
  }
  await runClone(false);
}

/** 用户确认仍要克隆已登记过的远端 */
function continueClone(openAfter: boolean): void {
  runClone(openAfter, true);
}
</script>

<template>
  <Card>
    <template #title>{{ t("projectManager.clone") }}</template>

    <Form :ref="formInst" :model="form" :rules="rules" layout="vertical" @finish="submitClone">
      <Row :gutter="16">
        <Col :span="24">
          <FormItem :label="t('cloneRepo.urlLabel')" name="url" required>
            <Input
              :value="form.url"
              :placeholder="t('cloneRepo.urlPlaceholder')"
              autocomplete="off"
              spellcheck="false"
              @update:value="handleUrlChange"
            />
          </FormItem>
        </Col>
        <Col :span="24">
          <FormItem :label="t('cloneRepo.pathLabel')" name="path" required>
            <SpaceCompact block>
              <Input
                v-model:value="form.path"
                :placeholder="t('cloneRepo.pathPlaceholder')"
                autocomplete="off"
                spellcheck="false"
              />
              <Button @click="pickParentDirectory">
                <template #icon>
                  <Icon name="FolderOpen" :size="16" />
                </template>
                {{ t("cloneRepo.pickButton") }}
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
                v-model:value="form.workspaceId"
                class="min-w-0 flex-1"
                :tree-data="workspaceTree"
                :field-names="{ label: 'name', value: 'id', children: 'children' }"
                :placeholder="t('common.pleaseSelect')"
                allow-clear
                tree-default-expand-all
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
          <FormItem>
            <Space>
              <Button type="primary" html-type="submit" :loading="cloning">
                {{ t("cloneRepo.submitButton") }}
              </Button>
              <Button :loading="cloning" @click="cloneAndContinue">
                {{ t("cloneRepo.cloneAndContinue") }}
              </Button>
            </Space>
          </FormItem>
        </Col>
      </Row>
    </Form>
  </Card>

  <WorkspaceGroupDialog ref="groupDialogRef" @created="handleCreatedGroup" />

  <ExistingRemoteCloneDialog ref="remoteDialogRef" @continue="continueClone" />
</template>
