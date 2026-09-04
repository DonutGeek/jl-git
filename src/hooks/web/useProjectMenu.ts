import { computed, h, toValue, type MaybeRefOrGetter } from "vue";

import type { MenuProps } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { useMessage } from "@/hooks/web/useMessage";
import { useModal } from "@/hooks/web/useModal";
import { openPrimaryRemoteInBrowser } from "@/api/git";
import { systemOpenService } from "@/api/system/system.open";
import { detectAppOs } from "@/services/window/windowChrome";
import { useProjectStoreWithOut } from "@/store/modules/project";
import type { Project } from "@/types/project";
import { copyToClipboard } from "@/utils/clipboard";

function menuIcon(name: string) {
  return (iconProps: { class?: unknown; style?: unknown } = {}) =>
    h(Icon, {
      name,
      size: 14,
      class: ["block leading-none", iconProps.class],
      style: iconProps.style,
    });
}

export function useProjectMenu(options: {
  disabled?: MaybeRefOrGetter<boolean>;
  onOpen?: (projectId: string) => void;
  /** recent：只从最近列表移除；project：取消登记仓库 */
  deleteMode?: MaybeRefOrGetter<"project" | "recent">;
}) {
  const { t } = useI18n();
  const message = useMessage();
  const modal = useModal();
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

  const deleteMode = computed(() => toValue(options.deleteMode) ?? "project");

  const menuItems = computed<MenuProps["items"]>(() => {
    const disabled = toValue(options.disabled) ?? false;
    return [
      {
        key: "open",
        label: t("projectManager.openProject"),
        icon: menuIcon("FolderOpen"),
        disabled,
      },
      { type: "divider" },
      {
        key: "copy",
        label: t("common.copy"),
        icon: menuIcon("Copy"),
        disabled,
        children: [
          {
            key: "copy-remote",
            label: t("projectManager.copyRemote"),
            icon: menuIcon("Link"),
          },
          {
            key: "copy-path",
            label: t("projectManager.copyLocalPath"),
            icon: menuIcon("Folder"),
          },
        ],
      },
      {
        key: "open-via",
        label: t("repo.openVia"),
        icon: menuIcon("ExternalLink"),
        disabled,
        children: [
          {
            key: "open-folder",
            label: revealLabel.value,
            icon: menuIcon("FolderOpen"),
          },
          {
            key: "open-editor",
            label: t("repo.openInEditor"),
            icon: menuIcon("ExternalLink"),
          },
          {
            key: "open-terminal",
            label: t("repo.openInTerminal"),
            icon: menuIcon("Terminal"),
          },
          {
            key: "open-browser",
            label: t("repo.openRemoteInBrowser"),
            icon: menuIcon("Globe"),
          },
        ],
      },
      { type: "divider" },
      {
        key: "delete",
        label:
          deleteMode.value === "recent"
            ? t("projectManager.removeFromRecent")
            : t("projectManager.deleteProject"),
        icon: menuIcon("Trash2"),
        danger: true,
        disabled,
      },
    ];
  });

  async function handleCopyRemote(project: Project): Promise<void> {
    const remoteUrl = project.remoteUrl?.trim();
    if (!remoteUrl) {
      message.info(t("repo.tabCopyRemoteEmpty"));
      return;
    }
    try {
      await copyToClipboard(remoteUrl);
      message.success(t("repo.tabCopyRemoteSuccess"));
    } catch (error) {
      message.error(error);
    }
  }

  async function handleCopyPath(project: Project): Promise<void> {
    try {
      await copyToClipboard(project.path);
      message.success(t("repo.tabCopyPathSuccess"));
    } catch (error) {
      message.error(error);
    }
  }

  async function runSystemOpen(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      message.error(error);
    }
  }

  async function handleOpenRemoteInBrowser(project: Project): Promise<void> {
    try {
      const result = await openPrimaryRemoteInBrowser(project.path);
      if (result === "empty") {
        message.info(t("repo.tabCopyRemoteEmpty"));
        return;
      }
      if (result === "unsupported") {
        message.error(t("repo.openRemoteUnsupported"));
      }
    } catch (error) {
      message.error(error);
    }
  }

  function requestDelete(project: Project): void {
    const removeRecentOnly = deleteMode.value === "recent";
    modal.confirm({
      title: removeRecentOnly
        ? t("projectManager.removeFromRecentTitle")
        : t("projectManager.deleteProjectTitle"),
      content: removeRecentOnly
        ? t("projectManager.removeFromRecentQuestion", { name: project.name })
        : t("projectManager.deleteProjectQuestion", { name: project.name }),
      icon: null,
      okType: "danger",
      okText: removeRecentOnly
        ? t("projectManager.removeFromRecent")
        : t("projectManager.deleteProject"),
      async onOk() {
        try {
          if (removeRecentOnly) {
            await useProjectStoreWithOut().removeRecent(project.id);
            message.success(t("projectManager.removeFromRecentSuccess", { name: project.name }));
            return;
          }
          await useProjectStoreWithOut().removeProject(project.id);
          message.success(t("projectManager.deleteProjectSuccess", { name: project.name }));
        } catch (error) {
          message.error(error);
          throw error;
        }
      },
    });
  }

  function handleMenuClick(project: Project): NonNullable<MenuProps["onClick"]> {
    return ({ key }) => {
      if (key === "open") {
        options.onOpen?.(project.id);
        return;
      }
      if (key === "copy-remote") {
        void handleCopyRemote(project);
        return;
      }
      if (key === "copy-path") {
        void handleCopyPath(project);
        return;
      }
      if (key === "open-folder") {
        void runSystemOpen(() => systemOpenService.revealInFileManager(project.path));
        return;
      }
      if (key === "open-editor") {
        void runSystemOpen(() => systemOpenService.openInEditor(project.path));
        return;
      }
      if (key === "open-terminal") {
        void runSystemOpen(() => systemOpenService.openTerminal(project.path));
        return;
      }
      if (key === "open-browser") {
        void handleOpenRemoteInBrowser(project);
        return;
      }
      if (key === "delete") {
        requestDelete(project);
      }
    };
  }

  return {
    menuItems,
    handleMenuClick,
  };
}
