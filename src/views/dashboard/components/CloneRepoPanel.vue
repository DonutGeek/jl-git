<script setup lang="ts">
import { computed, ref } from "vue";

import { Button, Card, Col, Form, FormItem, Input, Row, Space, SpaceCompact } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { ProjectIconSelect, WorkspaceSelectMenu } from "@/components/Project";

import { useMessage } from "@/hooks/web/useMessage";

import ExistingRemoteCloneDialog from "./ExistingRemoteCloneDialog.vue";

import { useProjectStoreWithOut } from "@/store/modules/project";

import { cloneRepository } from "@/services/git/git.clone";
import { projectService } from "@/services/project";
import { joinCloneDestPath, repoNameFromCloneUrl } from "@/utils/gitClonePath";
import {
  DEFAULT_PROJECT_ICON,
  type ProjectIcon as ProjectIconName,
  type ProjectRemoteMatch,
} from "@/types/project";

defineOptions({ name: "CloneRepoPanel" });

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  open: [projectId: string];
}>();

const { t } = useI18n();
const message = useMessage();
const url = ref("");
const path = ref("");
const suggestedRepoName = ref("");
const alias = ref("");
const aliasEdited = ref(false);
const projectIcon = ref<ProjectIconName>(DEFAULT_PROJECT_ICON);
const workspaceId = ref("");
const cloning = ref(false);
const picking = ref(false);
const remoteMatches = ref<ProjectRemoteMatch[]>([]);
const pendingCloneOpenAfter = ref<boolean | null>(null);

const busy = computed(
  () => cloning.value || picking.value || pendingCloneOpenAfter.value !== null || props.disabled,
);
const canSubmit = computed(
  () => !busy.value && url.value.trim().length > 0 && path.value.trim().length > 0,
);

function resetForm(): void {
  url.value = "";
  path.value = "";
  suggestedRepoName.value = "";
  alias.value = "";
  aliasEdited.value = false;
  projectIcon.value = DEFAULT_PROJECT_ICON;
  workspaceId.value = "";
}

function handleUrlChange(nextUrl: string): void {
  url.value = nextUrl;
  const repoName = repoNameFromCloneUrl(nextUrl);
  suggestedRepoName.value = repoName;
  if (!aliasEdited.value && repoName) {
    alias.value = repoName;
  }
}

function handleAliasChange(next: string): void {
  aliasEdited.value = true;
  alias.value = next;
}

function handleRemoteDialogOpen(open: boolean): void {
  if (open) {
    return;
  }
  pendingCloneOpenAfter.value = null;
  remoteMatches.value = [];
}

async function pickParentDirectory(): Promise<void> {
  if (busy.value) {
    return;
  }
  const pickPromise = projectService.pickDirectory();
  picking.value = true;
  try {
    const selected = await pickPromise;
    if (!selected) {
      return;
    }
    const name = suggestedRepoName.value || repoNameFromCloneUrl(url.value) || "repository";
    suggestedRepoName.value = name;
    path.value = joinCloneDestPath(selected, name);
    if (!aliasEdited.value) {
      alias.value = name;
    }
  } catch (error) {
    message.error(error);
  } finally {
    picking.value = false;
  }
}

async function runClone(openAfter: boolean, skipRemoteWarn = false): Promise<void> {
  const remoteUrl = url.value.trim();
  const destPath = path.value.trim();
  if (!remoteUrl) {
    message.error(t("cloneRepo.urlRequired"));
    return;
  }
  if (!destPath) {
    message.error(t("cloneRepo.pathRequired"));
    return;
  }
  if (cloning.value || picking.value || props.disabled) {
    return;
  }
  if (!skipRemoteWarn && pendingCloneOpenAfter.value !== null) {
    return;
  }

  cloning.value = true;
  try {
    if (!skipRemoteWarn) {
      try {
        const uniqueness = await projectService.checkUniqueness({ remoteUrl });
        if (uniqueness.kind === "existingRemote" && uniqueness.matches.length > 0) {
          remoteMatches.value = uniqueness.matches;
          pendingCloneOpenAfter.value = openAfter;
          return;
        }
      } catch (error) {
        console.warn("remote uniqueness check skipped", error);
      }
    }

    const cloned = await cloneRepository(remoteUrl, destPath);
    const input = {
      path: cloned.path,
      name: alias.value.trim() || undefined,
      workspaceId: workspaceId.value || undefined,
      icon: projectIcon.value,
    };
    const result = openAfter
      ? await useProjectStoreWithOut().addAndOpen(input)
      : await useProjectStoreWithOut().addProject(input);

    resetForm();
    message.success(
      openAfter
        ? t("cloneRepo.success", { name: result.project.name })
        : t("cloneRepo.cloneAndContinueSuccess", { name: result.project.name }),
    );
    if (openAfter) {
      emit("open", result.project.id);
    }
  } catch (error) {
    message.error(error);
  } finally {
    cloning.value = false;
  }
}

function continueClone(): void {
  const openAfter = pendingCloneOpenAfter.value ?? true;
  pendingCloneOpenAfter.value = null;
  remoteMatches.value = [];
  runClone(openAfter, true);
}
</script>

<template>
  <Card>
    <template #title>{{ t("projectManager.clone") }}</template>

    <Form layout="vertical" @finish="runClone(true)">
      <Row :gutter="16">
        <Col :span="24">
          <FormItem :label="t('cloneRepo.urlLabel')" name="url">
            <Input
              :value="url"
              :placeholder="t('cloneRepo.urlPlaceholder')"
              autocomplete="off"
              spellcheck="false"
              :disabled="busy"
              @update:value="handleUrlChange"
            />
          </FormItem>
        </Col>
        <Col :span="24">
          <FormItem :label="t('cloneRepo.pathLabel')" name="path">
            <SpaceCompact block>
              <Input
                v-model:value="path"
                :placeholder="t('cloneRepo.pathPlaceholder')"
                autocomplete="off"
                spellcheck="false"
                :disabled="busy"
              />
              <Button :disabled="busy" @click="pickParentDirectory">
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
              :value="alias"
              :placeholder="t('openRepo.aliasPlaceholder')"
              autocomplete="off"
              :disabled="busy"
              @update:value="handleAliasChange"
            />
          </FormItem>
        </Col>
        <Col :xs="24" :sm="12">
          <FormItem :label="t('projectManager.projectIcon')" name="icon">
            <ProjectIconSelect v-model:value="projectIcon" :disabled="busy" />
          </FormItem>
        </Col>
        <Col :xs="24" :sm="12">
          <FormItem :label="t('projectManager.workspaceLabel')" name="workspace">
            <WorkspaceSelectMenu v-model:value="workspaceId" :disabled="busy" />
          </FormItem>
        </Col>
        <Col :span="24">
          <FormItem>
            <Space>
              <Button type="primary" html-type="submit" :disabled="!canSubmit" :loading="cloning">
                {{ t("cloneRepo.submitButton") }}
              </Button>
              <Button :disabled="!canSubmit" @click="runClone(false)">
                {{ t("cloneRepo.cloneAndContinue") }}
              </Button>
            </Space>
          </FormItem>
        </Col>
      </Row>
    </Form>
  </Card>

  <ExistingRemoteCloneDialog
    :open="pendingCloneOpenAfter !== null"
    :matches="remoteMatches"
    @update:open="handleRemoteDialogOpen"
    @continue="continueClone"
  />
</template>
