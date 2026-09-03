<script setup lang="ts">
import { computed, ref, watch } from "vue";

import {
  Button,
  Col,
  Drawer,
  Form,
  FormItem,
  Input,
  Modal,
  Row,
  Tooltip,
  message,
} from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import ProjectIconSelect from "./ProjectIconSelect.vue";
import WorkspaceSelectMenu from "./WorkspaceSelectMenu.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { useZustand } from "@/hooks/core/useZustand";
import { projectService } from "@/services/project";
import { useProjectStore, useProjectStoreWithOut } from "@/store/modules/project";
import { isAppError, toUserMessage } from "@/types/error";
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
const workspaces = useZustand(useProjectStore, (state) => state.workspaces);
const name = ref(props.project.name);
const path = ref(props.project.path);
const icon = ref<ProjectIcon>(props.project.icon);
const workspaceId = ref(props.project.workspaceId ?? "");
const description = ref(props.project.description ?? "");
const saving = ref(false);
const picking = ref(false);
const remoteMismatchOpen = ref(false);
const pendingSave = ref<PendingSave | null>(null);

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
    remoteMismatchOpen.value = false;
    pendingSave.value = null;
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
    message.error(toUserMessage(error));
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
    remoteMismatchOpen.value = false;
    pendingSave.value = null;
    emit("update:open", false);
  } catch (error) {
    if (
      !allowRemoteMismatch &&
      input.path &&
      isAppError(error) &&
      error.code === "REMOTE_MISMATCH"
    ) {
      pendingSave.value = input;
      remoteMismatchOpen.value = true;
      return;
    }
    message.error(toUserMessage(error));
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
              <div class="flex gap-2">
                <Input
                  id="project-settings-path"
                  v-model:value="path"
                  :placeholder="t('openRepo.pathPlaceholder')"
                  autocomplete="off"
                  :disabled="saving"
                />
                <Tooltip :title="t('openRepo.pickButton')">
                  <Button
                    :aria-label="t('openRepo.pickButton')"
                    :disabled="saving || picking"
                    @click="void handlePickDirectory()"
                  >
                    <Icon name="FolderOpen" :size="16" />
                  </Button>
                </Tooltip>
              </div>
              <p class="text-muted-foreground mt-1 text-xs">
                {{ t("projectManager.projectPathEditHint") }}
              </p>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem :label="t('openRepo.aliasLabel')" name="name">
              <Input
                id="project-settings-name"
                v-model:value="name"
                autocomplete="off"
                :disabled="saving"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="t('projectManager.projectIcon')" name="icon">
              <ProjectIconSelect
                id="project-settings-icon"
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
                :select-label="t('projectManager.workspaceLabel')"
                :disabled="saving || sourceLocked"
                @update:value="(next: string) => (workspaceId = next)"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem :label="t('openRepo.detailLabel')" name="description">
              <Input.TextArea
                id="project-settings-description"
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
        @click="void handleSubmit()"
      >
        {{ t("projectManager.saveProjectSettings") }}
      </Button>
    </template>
  </Drawer>

  <Modal
    :open="remoteMismatchOpen"
    :title="t('projectManager.projectPathRemoteMismatchTitle')"
    :ok-text="t('projectManager.projectPathRemoteMismatchConfirm')"
    :cancel-text="t('common.cancel')"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: saving || !pendingSave }"
    @update:open="
      (next: boolean) => {
        if (!saving) {
          remoteMismatchOpen = next;
          if (!next) {
            pendingSave = null;
          }
        }
      }
    "
    @ok="
      () => {
        if (pendingSave) {
          void persist(pendingSave, true);
        }
      }
    "
  >
    <p class="text-sm">{{ t("projectManager.projectPathRemoteMismatchDescription") }}</p>
  </Modal>
</template>
