<script setup lang="ts">
import { ref } from "vue";

import { Button, Card, Col, Form, FormItem, Input, Row, Space, SpaceCompact } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import {
  ExistingProjectDialog,
  ProjectIconSelect,
  WorkspaceSelectMenu,
} from "@/components/Project";

import { useMessage } from "@/hooks/web/useMessage";

import { useProjectStoreWithOut } from "@/store/modules/project";

import { projectService } from "@/services/project";
import {
  DEFAULT_PROJECT_ICON,
  type Project,
  type ProjectIcon as ProjectIconName,
} from "@/types/project";

defineOptions({ name: "OpenRepoForm" });

const emit = defineEmits<{
  open: [projectId: string];
}>();

const { t } = useI18n();
const message = useMessage();
const path = ref("");
const alias = ref("");
const aliasEdited = ref(false);
const description = ref("");
const projectIcon = ref<ProjectIconName>(DEFAULT_PROJECT_ICON);
const workspaceId = ref("");
const opening = ref(false);
const picking = ref(false);
const existingProject = ref<Project | null>(null);

function getProjectName(nextPath: string): string {
  const normalizedPath = nextPath.trim().replace(/[\\/]+$/, "");
  const parts = normalizedPath.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

function handlePathChange(value: string): void {
  path.value = value;
  if (!aliasEdited.value) {
    alias.value = getProjectName(value);
  }
}

function handleAliasChange(next: string): void {
  aliasEdited.value = true;
  alias.value = next;
}

function handleExistingDialogOpen(open: boolean): void {
  if (!open) {
    existingProject.value = null;
  }
}

async function pickPath(): Promise<void> {
  if (picking.value || opening.value) {
    return;
  }
  const pickPromise = projectService.pickDirectory();
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

function resetOpenForm(): void {
  path.value = "";
  alias.value = "";
  aliasEdited.value = false;
  description.value = "";
  projectIcon.value = DEFAULT_PROJECT_ICON;
  workspaceId.value = "";
}

async function submitOpen(): Promise<void> {
  const repositoryPath = path.value.trim();
  if (!repositoryPath || opening.value) {
    return;
  }
  opening.value = true;
  try {
    const result = await useProjectStoreWithOut().addAndOpen({
      path: repositoryPath,
      name: alias.value.trim() || undefined,
      workspaceId: workspaceId.value || undefined,
      description: description.value.trim() || undefined,
      icon: projectIcon.value,
    });
    if (result.alreadyExists) {
      existingProject.value = result.project;
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

async function saveAndContinue(): Promise<void> {
  const repositoryPath = path.value.trim();
  if (!repositoryPath || opening.value) {
    return;
  }
  opening.value = true;
  try {
    const result = await useProjectStoreWithOut().addProject({
      path: repositoryPath,
      name: alias.value.trim() || undefined,
      workspaceId: workspaceId.value || undefined,
      description: description.value.trim() || undefined,
      icon: projectIcon.value,
    });
    if (result.alreadyExists) {
      existingProject.value = result.project;
      return;
    }
    resetOpenForm();
    message.success(t("openRepo.saveAndContinueSuccess", { name: result.project.name }));
  } catch (error) {
    message.error(error);
  } finally {
    opening.value = false;
  }
}

async function confirmExistingProject(project: Project): Promise<void> {
  existingProject.value = null;
  resetOpenForm();
  try {
    await useProjectStoreWithOut().openExisting(project.id);
    emit("open", project.id);
  } catch (error) {
    message.error(error);
  }
}
</script>

<template>
  <Card>
    <template #title>{{ t("openRepo.title") }}</template>
    <Form layout="vertical" @finish="submitOpen">
      <Row :gutter="16">
        <Col :span="24">
          <FormItem :label="t('openRepo.pathLabel')" name="path">
            <SpaceCompact block>
              <Input
                :value="path"
                :placeholder="t('openRepo.pathPlaceholder')"
                autocomplete="off"
                :disabled="opening"
                @update:value="handlePathChange"
              />
              <Button :disabled="picking || opening" @click="pickPath">
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
              :value="alias"
              :placeholder="t('openRepo.aliasPlaceholder')"
              autocomplete="off"
              :disabled="opening"
              @update:value="handleAliasChange"
            />
          </FormItem>
        </Col>
        <Col :xs="24" :sm="12">
          <FormItem :label="t('projectManager.projectIcon')" name="icon">
            <ProjectIconSelect v-model:value="projectIcon" :disabled="opening" />
          </FormItem>
        </Col>
        <Col :xs="24" :sm="12">
          <FormItem :label="t('projectManager.workspaceLabel')" name="workspace">
            <WorkspaceSelectMenu v-model:value="workspaceId" :disabled="opening" />
          </FormItem>
        </Col>
        <Col :span="24">
          <FormItem :label="t('openRepo.detailLabel')" name="description">
            <Input.TextArea
              v-model:value="description"
              :rows="4"
              :placeholder="t('openRepo.detailPlaceholder')"
              :disabled="opening"
            />
          </FormItem>
        </Col>
        <Col :span="24">
          <FormItem>
            <Space>
              <Button
                type="primary"
                html-type="submit"
                :disabled="!path.trim() || opening"
                :loading="opening"
              >
                {{ t("openRepo.submitButton") }}
              </Button>
              <Button :disabled="!path.trim() || opening" @click="saveAndContinue">
                {{ t("openRepo.saveAndContinue") }}
              </Button>
            </Space>
          </FormItem>
        </Col>
      </Row>
    </Form>
  </Card>

  <ExistingProjectDialog
    :open="existingProject !== null"
    :project="existingProject"
    action="open"
    @update:open="handleExistingDialogOpen"
    @confirm="confirmExistingProject"
  />
</template>
