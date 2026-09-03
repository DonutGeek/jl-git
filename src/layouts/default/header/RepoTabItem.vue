<script setup lang="ts">
import { computed } from "vue";

import { Dropdown, message, type MenuProps } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { openPrimaryRemoteInBrowser } from "@/services/git";
import { openInEditor, openTerminal, revealInFileManager } from "@/services/system/system.open";
import { detectAppOs } from "@/services/window/windowChrome";
import { toUserMessage } from "@/types/error";

import type { TabDisplayItem, RepoTabMenuLabels } from "./repoTabTypes";
import type { Project } from "@/types/project";

const props = defineProps<{
  tab: TabDisplayItem;
  isActive: boolean;
  tabIndex: number;
  tabCount: number;
  closeLabel: string;
  labels: RepoTabMenuLabels;
}>();

const emit = defineEmits<{
  select: [tabId: string];
  close: [tabId: string];
  closeOthers: [tabId: string];
  closeLeft: [tabId: string];
  closeRight: [tabId: string];
  remove: [project: Project];
  setAlias: [project: Project];
  copyRemote: [project: Project];
  copyPath: [project: Project];
}>();

defineOptions({ name: "RepoTabItem" });

const { t } = useI18n();

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

const menuItems = computed<MenuProps["items"]>(() => {
  const items: NonNullable<MenuProps["items"]> = [
    { key: "close", label: props.labels.close },
    {
      key: "close-more",
      label: props.labels.closeMore,
      children: [
        { key: "close-others", label: props.labels.closeOthers, disabled: props.tabCount <= 1 },
        { key: "close-left", label: props.labels.closeLeft, disabled: props.tabIndex === 0 },
        {
          key: "close-right",
          label: props.labels.closeRight,
          disabled: props.tabIndex >= props.tabCount - 1,
        },
      ],
    },
  ];

  if (!props.tab.project) {
    return items;
  }

  items.push(
    { type: "divider" },
    { key: "alias", label: props.labels.setAlias },
    {
      key: "copy",
      label: props.labels.copy,
      children: [
        { key: "copy-remote", label: props.labels.copyRemote },
        { key: "copy-path", label: props.labels.copyPath },
      ],
    },
    {
      key: "open",
      label: t("repo.openVia"),
      children: [
        { key: "open-folder", label: revealLabel.value },
        { key: "open-editor", label: t("repo.openInEditor") },
        { key: "open-terminal", label: t("repo.openInTerminal") },
        { key: "open-browser", label: t("repo.openRemoteInBrowser") },
      ],
    },
    { type: "divider" },
    { key: "remove", label: props.labels.remove, danger: true },
  );

  return items;
});

async function handleOpen(kind: "folder" | "editor" | "terminal" | "browser"): Promise<void> {
  const project = props.tab.project;
  if (!project) {
    return;
  }
  try {
    if (kind === "folder") {
      await revealInFileManager(project.path);
      return;
    }
    if (kind === "editor") {
      await openInEditor(project.path);
      return;
    }
    if (kind === "terminal") {
      await openTerminal(project.path);
      return;
    }
    const result = await openPrimaryRemoteInBrowser(project.path);
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

const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
  if (key === "close") {
    emit("close", props.tab.id);
    return;
  }
  if (key === "close-others") {
    emit("closeOthers", props.tab.id);
    return;
  }
  if (key === "close-left") {
    emit("closeLeft", props.tab.id);
    return;
  }
  if (key === "close-right") {
    emit("closeRight", props.tab.id);
    return;
  }
  if (key === "alias" && props.tab.project) {
    emit("setAlias", props.tab.project);
    return;
  }
  if (key === "copy-remote" && props.tab.project) {
    emit("copyRemote", props.tab.project);
    return;
  }
  if (key === "copy-path" && props.tab.project) {
    emit("copyPath", props.tab.project);
    return;
  }
  if (key === "open-folder") {
    void handleOpen("folder");
    return;
  }
  if (key === "open-editor") {
    void handleOpen("editor");
    return;
  }
  if (key === "open-terminal") {
    void handleOpen("terminal");
    return;
  }
  if (key === "open-browser") {
    void handleOpen("browser");
  }
  if (key === "remove" && props.tab.project) {
    emit("remove", props.tab.project);
  }
};
</script>

<template>
  <Dropdown :trigger="['contextmenu']" :menu="{ items: menuItems, onClick: handleMenuClick }">
    <div
      :data-repo-tab-id="tab.id"
      :class="
        cn(
          'group relative flex h-7 max-w-44 items-center rounded-md font-mono text-xs leading-none transition-colors',
          isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/60',
        )
      "
    >
      <button
        type="button"
        :class="
          cn('flex h-full min-w-0 flex-1 items-center py-0 pr-0.5 pl-2.5 text-left leading-none')
        "
        :title="tab.title"
        :aria-current="isActive ? 'page' : undefined"
        @click="emit('select', tab.id)"
      >
        <span class="truncate">{{ tab.label }}</span>
      </button>
      <button
        type="button"
        :class="
          cn(
            'hover:bg-muted mr-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm',
            isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-70 focus-visible:opacity-70',
          )
        "
        :aria-label="closeLabel"
        @click.stop="emit('close', tab.id)"
      >
        <Icon name="X" :size="12" />
      </button>
    </div>
  </Dropdown>
</template>
