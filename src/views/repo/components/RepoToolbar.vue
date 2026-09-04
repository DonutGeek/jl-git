<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";

import { Button, Dropdown, Tooltip, type MenuProps } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import type { RepoMainView } from "../utils/repoWorkspaceTypes";
import { useWindowChromeLayout } from "@/hooks/core/useWindowChromeLayout";
import { useMessage } from "@/hooks/web/useMessage";
import { cn } from "@/lib/utils";
import { openBranchCompareWindow } from "@/services/window/branchCompareWindow";
import { useAppPrefsStoreWithOut } from "@/store/modules/app";
import { useOpenTabsStoreWithOut } from "@/store/modules/multipleTab";
import { useRepoStore, useRepoStoreWithOut } from "@/store/modules/repo";
import type { GitBranch } from "@/types/git";
import type { Project } from "@/types/project";
import { resolveDefaultCompareTarget } from "@/utils/branchCompareTarget";
import { isLocalBranchPublished } from "@/utils/branchPublish";
import { isPushRejectedError, toastPushError } from "@/utils/gitPushError";

defineOptions({ name: "RepoToolbar" });

const props = withDefaults(
  defineProps<{
    project: Project;
    mainView: RepoMainView;
    loadingShell?: boolean;
  }>(),
  { loadingShell: false },
);

const emit = defineEmits<{
  "update:mainView": [view: RepoMainView];
}>();

const EMPTY_BRANCHES: GitBranch[] = [];

const { t } = useI18n();
const message = useMessage();
const router = useRouter();
const { isMacOverlay } = useWindowChromeLayout();
const repoStore = useRepoStore();
const {
  status: storeStatus,
  branches: storeBranches,
  loading: storeLoading,
} = storeToRefs(repoStore);
const status = computed(() => (props.loadingShell ? null : storeStatus.value));
const branches = computed(() => (props.loadingShell ? EMPTY_BRANCHES : storeBranches.value));
const loading = computed(() => props.loadingShell || storeLoading.value);
const checkingOut = ref(false);
const fetching = ref(false);
const pulling = ref(false);
const pushing = ref(false);

watch(
  () => props.project.path,
  () => {
    checkingOut.value = false;
    fetching.value = false;
    pulling.value = false;
    pushing.value = false;
  },
);

const changeCount = computed(() => status.value?.entries.length ?? 0);
const ahead = computed(() => status.value?.ahead ?? 0);
const behind = computed(() => status.value?.behind ?? 0);
const localBranches = computed(() => branches.value.filter((branch) => !branch.isRemote));
const needsPublish = computed(() => {
  if (!status.value?.branch || status.value.detached) {
    return false;
  }
  const current = localBranches.value.find((branch) => branch.name === status.value?.branch);
  if (!current) {
    return !status.value.upstream;
  }
  return !isLocalBranchPublished(current, branches.value);
});
const syncBusy = computed(() => fetching.value || pulling.value || pushing.value || loading.value);
const branchSwitchLocked = computed(() => checkingOut.value || pushing.value || pulling.value);
const branchLabel = computed(() =>
  status.value?.detached ? t("repo.detached") : (status.value?.branch ?? t("repo.currentBranch")),
);

const views = computed(() => [
  { id: "workspace" as const, icon: "LayoutDashboard", label: t("repo.viewWorkspace") },
  { id: "changes" as const, icon: "ListTree", label: t("repo.viewChanges") },
  { id: "history" as const, icon: "Clock3", label: t("repo.viewHistory") },
]);

const branchMenuItems = computed<MenuProps["items"]>(() =>
  localBranches.value.map((branch) => ({
    key: branch.name,
    label: branch.name,
    disabled: branchSwitchLocked.value,
  })),
);

async function handleCheckout(branchName: string): Promise<void> {
  if (branchName === status.value?.branch) {
    return;
  }
  checkingOut.value = true;
  try {
    await useRepoStoreWithOut().checkout(branchName);
  } catch (error) {
    message.error(error);
  } finally {
    checkingOut.value = false;
  }
}

async function handleFetch(): Promise<void> {
  if (syncBusy.value) {
    return;
  }
  fetching.value = true;
  try {
    await useRepoStoreWithOut().fetch();
  } catch (error) {
    message.error(error);
  } finally {
    fetching.value = false;
  }
}

async function handlePull(): Promise<void> {
  if (syncBusy.value) {
    return;
  }
  pulling.value = true;
  try {
    const rebase = useAppPrefsStoreWithOut().pullStrategy === "rebase";
    const result = await useRepoStoreWithOut().pull({ rebase });
    if (result.conflict) {
      message.error(t("repo.pullConflict"));
    }
  } catch (error) {
    message.error(error);
  } finally {
    pulling.value = false;
  }
}

async function handlePush(): Promise<void> {
  if (syncBusy.value) {
    return;
  }
  pushing.value = true;
  try {
    const current = status.value?.branch;
    await useRepoStoreWithOut().push({
      remote: "origin",
      ...(needsPublish.value && current
        ? { branch: current, setUpstream: true }
        : current
          ? { branch: current }
          : {}),
    });
  } catch (error) {
    toastPushError(message, error, {
      onUpdate: () => {
        void handlePull();
      },
    });
    if (isPushRejectedError(error)) {
      void useRepoStoreWithOut()
        .fetch()
        .catch(() => undefined);
    }
  } finally {
    pushing.value = false;
  }
}

async function handleRefresh(): Promise<void> {
  try {
    await useRepoStoreWithOut().refreshStatus();
  } catch (error) {
    message.error(error);
  }
}

function goDashboard(): void {
  const tabId = useOpenTabsStoreWithOut().openNewTab();
  void router.push(`/tab/${tabId}`);
}

function handleOpenBranchCompare(): void {
  const currentBranch =
    status.value?.branch ?? branches.value.find((branch) => branch.isCurrent)?.name;
  if (!currentBranch) {
    message.error(t("repo.openBranchCompareNoBranch"));
    return;
  }
  void openBranchCompareWindow({
    projectId: props.project.id,
    mode: "branch",
    base: currentBranch,
    target: resolveDefaultCompareTarget(branches.value, currentBranch),
  }).catch((error: unknown) => {
    message.error(error);
  });
}
</script>

<template>
  <div
    class="border-border flex h-10 shrink-0 items-center gap-2 border-b px-3"
    :data-tauri-drag-region="isMacOverlay ? true : undefined"
  >
    <button
      type="button"
      class="hover:bg-accent/60 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1"
      @click="goDashboard"
    >
      <Icon v-if="project.icon" :name="project.icon" :size="16" class="shrink-0" />
      <span class="truncate text-sm font-medium">{{ project.name }}</span>
    </button>

    <div class="bg-border mx-1 h-4 w-px shrink-0" />

    <div class="flex items-center gap-0.5">
      <Tooltip v-for="view in views" :key="view.id" :title="view.label">
        <button
          type="button"
          :class="
            cn(
              'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors',
              mainView === view.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent/60',
            )
          "
          :aria-pressed="mainView === view.id"
          @click="emit('update:mainView', view.id)"
        >
          <Icon :name="view.icon" :size="14" />
          <span>{{ view.label }}</span>
          <span v-if="view.id === 'changes' && changeCount > 0" class="tabular-nums">
            {{ changeCount }}
          </span>
        </button>
      </Tooltip>
    </div>

    <div class="min-w-2 flex-1" :data-tauri-drag-region="isMacOverlay ? true : undefined" />

    <Dropdown
      :trigger="['click']"
      :disabled="branchSwitchLocked || loadingShell"
      :menu="{
        items: branchMenuItems,
        onClick: ({ key }) => void handleCheckout(String(key)),
      }"
    >
      <Button size="small" :disabled="branchSwitchLocked || loadingShell" :loading="checkingOut">
        <template #icon>
          <Icon name="GitBranch" :size="14" />
        </template>
        <span class="max-w-40 truncate">{{ branchLabel }}</span>
        <Icon name="ChevronDown" :size="12" />
      </Button>
    </Dropdown>

    <Tooltip :title="t('repo.openBranchCompare')">
      <Button size="small" :disabled="loadingShell" @click="handleOpenBranchCompare">
        <template #icon>
          <Icon name="GitCompareArrows" :size="14" />
        </template>
      </Button>
    </Tooltip>

    <div class="text-muted-foreground flex items-center gap-1 text-xs tabular-nums">
      <span v-if="ahead > 0">↑{{ ahead }}</span>
      <span v-if="behind > 0">↓{{ behind }}</span>
    </div>

    <Tooltip :title="t('repo.checkUpdate')">
      <Button
        size="small"
        :disabled="syncBusy || loadingShell"
        :loading="fetching"
        @click="handleFetch"
      >
        <template #icon>
          <Icon name="CloudUpload" :size="14" />
        </template>
      </Button>
    </Tooltip>
    <Tooltip :title="t('repo.pull')">
      <Button
        size="small"
        :disabled="syncBusy || loadingShell"
        :loading="pulling"
        @click="handlePull"
      >
        <template #icon>
          <Icon name="ArrowDownToLine" :size="14" />
        </template>
      </Button>
    </Tooltip>
    <Tooltip :title="needsPublish ? t('repo.publishBranch') : t('repo.push')">
      <Button
        size="small"
        :disabled="syncBusy || loadingShell"
        :loading="pushing"
        @click="handlePush"
      >
        <template #icon>
          <Icon name="ArrowUpFromLine" :size="14" />
        </template>
      </Button>
    </Tooltip>
    <Tooltip :title="t('repo.refresh')">
      <Button size="small" :disabled="loadingShell" @click="handleRefresh">
        <template #icon>
          <Icon name="RotateCw" :size="14" />
        </template>
      </Button>
    </Tooltip>
  </div>
</template>
