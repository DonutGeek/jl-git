<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";

import {
  Button,
  Col,
  Drawer,
  Form,
  FormItem,
  Input,
  Row,
  SpaceCompact,
  Tooltip,
} from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import ProjectIconSelect from "./ProjectIconSelect.vue";
import WorkspaceSelectMenu from "./WorkspaceSelectMenu.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { useMessage } from "@/hooks/web/useMessage";
import { useModal } from "@/hooks/web/useModal";
import { projectService } from "@/services/project";
import { useProjectStore, useProjectStoreWithOut } from "@/store/modules/project";
import { isAppError } from "@/types/error";
import type { Project, ProjectIcon } from "@/types/project";

defineOptions({ name: "ProjectSettingsDialog" });

const props = defineProps<{
  project: Project;
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
}>();

interface PendingSave {
  name: string;
  icon: ProjectIcon;
  workspaceId: string | null;
  description: string | null;
  path?: string;
}

const { t } = useI18n();
const message = useMessage();
const modal = useModal();
const projectStore = useProjectStore();
const { workspaces } = storeToRefs(projectStore);
const name = ref(props.project.name);
const path = ref(props.project.path);
const icon = ref<ProjectIcon>(props.project.icon);
const workspaceId = ref(props.project.workspaceId ?? "");
const description = ref(props.project.description ?? "");
const saving = ref(false);
const picking = ref(false);

const sourceLocked = computed(() =>
  Boolean(
    props.project.workspaceId &&
    workspaces.value.find((item) => item.id === props.project.workspaceId)?.locked,
  ),
);

watch(
  () => [props.open, props.project] as const,
  ([open]) => {
    if (!open) {
      return;
    }
    name.value = props.project.name;
    path.value = props.project.path;
    icon.value = props.project.icon;
    workspaceId.value = props.project.workspaceId ?? "";
    description.value = props.project.description ?? "";
  },
);

function handleOpenChange(next: boolean): void {
  if (!saving.value) {
    emit("update:open", next);
  }
}

async function handlePickDirectory(): Promise<void> {
  if (picking.value || saving.value) {
    return;
  }
  const pickPromise = projectService.pickDirectory();
  picking.value = true;
  try {
    const selectedPath = await pickPromise;
    if (selectedPath) {
      path.value = selectedPath;
    }
  } catch (error) {
    message.error(error);
  } finally {
    picking.value = false;
  }
}

async function persist(input: PendingSave, allowRemoteMismatch: boolean): Promise<void> {
  saving.value = true;
  try {
    await useProjectStoreWithOut().updateProject({
      id: props.project.id,
      name: input.name,
      icon: input.icon,
      workspaceId: input.workspaceId,
      description: input.description,
      path: input.path,
      allowRemoteMismatch: allowRemoteMismatch || undefined,
    });
    message.success(t("projectManager.projectSettingsSuccess"));
    emit("update:open", false);
  } catch (error) {
    if (
      !allowRemoteMismatch &&
      input.path &&
      isAppError(error) &&
      error.code === "REMOTE_MISMATCH"
    ) {
      saving.value = false;
      const confirmed = await modal.confirm({
        title: t("projectManager.projectPathRemoteMismatchTitle"),
        content: t("projectManager.projectPathRemoteMismatchDescription"),
        icon: null,
        okText: t("projectManager.projectPathRemoteMismatchConfirm"),
      });
      if (confirmed) {
        await persist(input, true);
      }
      return;
    }
    message.error(error);
  } finally {
    saving.value = false;
  }
}

async function handleSubmit(): Promise<void> {
  const nextName = name.value.trim();
  const nextPath = path.value.trim();
  if (!nextName || !nextPath || saving.value) {
    return;
  }

  const nextWorkspaceId = workspaceId.value || null;
  if (nextWorkspaceId !== (props.project.workspaceId ?? null)) {
    if (sourceLocked.value) {
      message.error(t("projectManager.lockedGroupMoveBlocked"));
      return;
    }
    if (nextWorkspaceId && workspaces.value.find((item) => item.id === nextWorkspaceId)?.locked) {
      message.error(t("projectManager.lockedGroupMoveBlocked"));
      return;
    }
  }

  const pathChanged = nextPath !== props.project.path;
  await persist(
    {
      name: nextName,
      icon: icon.value,
      workspaceId: nextWorkspaceId,
      description: description.value.trim() || null,
      path: pathChanged ? nextPath : undefined,
    },
    false,
  );
}
</script>

<template>
  <Drawer
    :open="open"
    :title="t('projectManager.manageEditAction')"
    :width="400"
    :mask-closable="!saving"
    @update:open="handleOpenChange"
  >
    <ScrollArea class="min-h-0 flex-1">
      <Form class="pr-1" layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem :label="t('openRepo.pathLabel')" name="path">
              <SpaceCompact block>
                <Input
                  v-model:value="path"
                  :placeholder="t('openRepo.pathPlaceholder')"
                  autocomplete="off"
                  :disabled="saving"
                />
                <Tooltip :title="t('openRepo.pickButton')">
                  <Button :disabled="saving || picking" @click="handlePickDirectory">
                    <template #icon>
                      <Icon name="FolderOpen" :size="16" />
                    </template>
                  </Button>
                </Tooltip>
              </SpaceCompact>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem :label="t('openRepo.aliasLabel')" name="name">
              <Input v-model:value="name" autocomplete="off" :disabled="saving" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="t('projectManager.projectIcon')" name="icon">
              <ProjectIconSelect
                :value="icon"
                :disabled="saving"
                @update:value="(next: string) => (icon = next)"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="t('projectManager.workspaceLabel')" name="workspace">
              <WorkspaceSelectMenu
                :value="workspaceId"
                :disabled="saving || sourceLocked"
                @update:value="(next: string) => (workspaceId = next)"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem :label="t('openRepo.detailLabel')" name="description">
              <Input.TextArea
                v-model:value="description"
                :rows="4"
                :placeholder="t('openRepo.detailPlaceholder')"
                :disabled="saving"
              />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </ScrollArea>
    <template #footer>
      <Button :disabled="saving" @click="handleOpenChange(false)">{{ t("common.cancel") }}</Button>
      <Button
        type="primary"
        :disabled="!name.trim() || !path.trim() || saving"
        :loading="saving"
        @click="handleSubmit"
      >
        {{ t("projectManager.saveProjectSettings") }}
      </Button>
    </template>
  </Drawer>
</template>
