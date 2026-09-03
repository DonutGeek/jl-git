<script setup lang="ts">
import { computed, ref } from "vue";

import { Dropdown, Modal, message, type MenuProps } from "antdv-next";
import { useI18n } from "vue-i18n";

import ProjectSettingsDialog from "./ProjectSettingsDialog.vue";
import { gitService, openPrimaryRemoteInBrowser, pickPrimaryRemoteUrl } from "@/services/git";
import { systemOpenService } from "@/services/system/system.open";
import { detectAppOs } from "@/services/window/windowChrome";
import { useProjectStoreWithOut } from "@/store/modules/project";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";
import { copyToClipboard } from "@/utils/clipboard";

defineOptions({ name: "ProjectContextMenu" });

const props = withDefaults(
  defineProps<{
    project: Project;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  open: [projectId: string];
  menuOpen: [];
  removed: [];
}>();

const { t } = useI18n();
const settingsOpen = ref(false);
const deleteOpen = ref(false);
const deleting = ref(false);

const revealLabel = computed(() => {
  const os = detectAppOs();
  if (os === "windows") {
    return t("repo.openInExplorer");
  }
  if (os === "linux") {
    return t("repo.openInFileManager");
  }
  return t("repo.openInFinder");
});

const menuItems = computed<MenuProps["items"]>(() => [
  { key: "open", label: t("projectManager.openProject"), disabled: props.disabled },
  { key: "edit", label: t("projectManager.manageEditAction"), disabled: props.disabled },
  { type: "divider" },
  {
    key: "copy",
    label: t("common.copy"),
    disabled: props.disabled,
    children: [
      { key: "copy-remote", label: t("projectManager.copyRemote") },
      { key: "copy-path", label: t("projectManager.copyLocalPath") },
    ],
  },
  {
    key: "open-via",
    label: t("repo.openVia"),
    disabled: props.disabled,
    children: [
      { key: "open-folder", label: revealLabel.value },
      { key: "open-editor", label: t("repo.openInEditor") },
      { key: "open-terminal", label: t("repo.openInTerminal") },
      { key: "open-browser", label: t("repo.openRemoteInBrowser") },
    ],
  },
  { type: "divider" },
  {
    key: "delete",
    label: t("projectManager.deleteProject"),
    danger: true,
    disabled: props.disabled,
  },
]);

async function handleCopyRemote(): Promise<void> {
  try {
    const remoteUrl = pickPrimaryRemoteUrl(await gitService.listRemotes(props.project.path));
    if (!remoteUrl) {
      message.info(t("repo.tabCopyRemoteEmpty"));
      return;
    }
    await copyToClipboard(remoteUrl);
    message.success(t("repo.tabCopyRemoteSuccess"));
  } catch (error) {
    message.error(toUserMessage(error));
  }
}

async function handleCopyPath(): Promise<void> {
  try {
    await copyToClipboard(props.project.path);
    message.success(t("repo.tabCopyPathSuccess"));
  } catch (error) {
    message.error(toUserMessage(error));
  }
}

async function runSystemOpen(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    message.error(toUserMessage(error));
  }
}

async function handleOpenRemoteInBrowser(): Promise<void> {
  try {
    const result = await openPrimaryRemoteInBrowser(props.project.path);
    if (result === "empty") {
      message.info(t("repo.tabCopyRemoteEmpty"));
      return;
    }
    if (result === "unsupported") {
      message.error(t("repo.openRemoteUnsupported"));
    }
  } catch (error) {
    message.error(toUserMessage(error));
  }
}

async function handleDelete(): Promise<void> {
  if (deleting.value) {
    return;
  }
  deleting.value = true;
  try {
    await useProjectStoreWithOut().removeProject(props.project.id);
    message.success(t("projectManager.deleteProjectSuccess", { name: props.project.name }));
    deleteOpen.value = false;
    emit("removed");
  } catch (error) {
    message.error(toUserMessage(error));
  } finally {
    deleting.value = false;
  }
}

const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
  if (key === "open") {
    emit("open", props.project.id);
    return;
  }
  if (key === "edit") {
    settingsOpen.value = true;
    return;
  }
  if (key === "copy-remote") {
    void handleCopyRemote();
    return;
  }
  if (key === "copy-path") {
    void handleCopyPath();
    return;
  }
  if (key === "open-folder") {
    void runSystemOpen(() => systemOpenService.revealInFileManager(props.project.path));
    return;
  }
  if (key === "open-editor") {
    void runSystemOpen(() => systemOpenService.openInEditor(props.project.path));
    return;
  }
  if (key === "open-terminal") {
    void runSystemOpen(() => systemOpenService.openTerminal(props.project.path));
    return;
  }
  if (key === "open-browser") {
    void handleOpenRemoteInBrowser();
    return;
  }
  if (key === "delete") {
    deleteOpen.value = true;
  }
};

function handleOpenChange(open: boolean): void {
  if (open) {
    emit("menuOpen");
  }
}
</script>

<template>
  <Dropdown
    :trigger="['contextmenu']"
    :disabled="disabled"
    :menu="{ items: menuItems, onClick: handleMenuClick }"
    @open-change="handleOpenChange"
  >
    <slot />
  </Dropdown>

  <ProjectSettingsDialog
    v-if="settingsOpen"
    :project="project"
    :open="settingsOpen"
    @update:open="(next: boolean) => (settingsOpen = next)"
  />

  <Modal
    :open="deleteOpen"
    :title="t('projectManager.deleteProjectTitle')"
    :ok-text="t('projectManager.deleteProject')"
    :cancel-text="t('common.cancel')"
    ok-type="danger"
    :confirm-loading="deleting"
    @update:open="(next: boolean) => (deleteOpen = next)"
    @ok="void handleDelete()"
  >
    <p class="text-sm">
      {{ t("projectManager.deleteProjectQuestion", { name: project.name }) }}
    </p>
  </Modal>
</template>
