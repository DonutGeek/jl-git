<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { Button, Checkbox, Empty, Input, Modal, Tag, Tooltip, message } from "antdv-next";
import dayjs from "dayjs";
import { useI18n } from "vue-i18n";

import { AppLoadingScreen, HighlightText } from "@/components/Common";
import { Icon } from "@/components/Icon";
import AppWindowHeader from "@/layouts/page/AppWindowHeader.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { cn } from "@/lib/utils";
import { deleteBranch, listBranches } from "@/services/git";
import { toUserMessage } from "@/types/error";
import type { GitBranch } from "@/types/git";
import type { Project } from "@/types/project";
import { isBranchActive } from "@/utils/branchActivity";
import { formatCommitDateTime } from "@/utils/formatCommitDateTime";

defineOptions({ name: "BranchManageWorkspace" });

const props = defineProps<{
  project: Project;
}>();

type ScopeFilter = "local" | "remote";
type ActivityFilter = "all" | "active" | "inactive";
type SortDirection = "asc" | "desc";

const { t } = useI18n();
const branches = ref<GitBranch[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const error = ref<string | null>(null);
const scope = ref<ScopeFilter>("local");
const activity = ref<ActivityFilter>("all");
const search = ref("");
const sortDir = ref<SortDirection>("desc");
const deleteTarget = ref<GitBranch | null>(null);
const deleteRemoteAlso = ref(false);
const deleteBusy = ref(false);

const scopedBranches = computed(() =>
  branches.value.filter((branch) => (scope.value === "local" ? !branch.isRemote : branch.isRemote)),
);

const activityCounts = computed(() => {
  let activeCount = 0;
  let inactiveCount = 0;
  for (const branch of scopedBranches.value) {
    if (isBranchActive(branch.tipAuthoredAt)) {
      activeCount += 1;
    } else {
      inactiveCount += 1;
    }
  }
  return { all: scopedBranches.value.length, active: activeCount, inactive: inactiveCount };
});

const visibleBranches = computed(() => {
  const query = search.value.trim().toLowerCase();
  let next = scopedBranches.value;
  if (activity.value === "active") {
    next = next.filter((branch) => isBranchActive(branch.tipAuthoredAt));
  } else if (activity.value === "inactive") {
    next = next.filter((branch) => !isBranchActive(branch.tipAuthoredAt));
  }
  if (query) {
    next = next.filter((branch) => {
      const haystack =
        `${branch.name} ${branch.upstream ?? ""} ${branch.tipShortId} ${branch.tipAuthorName}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  return [...next].sort((left, right) => compareByTime(left, right, sortDir.value));
});

const deleteHasRemote = computed(() => {
  if (!deleteTarget.value || deleteTarget.value.isRemote) {
    return false;
  }
  const remoteName = `origin/${deleteTarget.value.name}`;
  return branches.value.some((branch) => branch.isRemote && branch.name === remoteName);
});

const deleteQuestion = computed(() =>
  t("repo.deleteBranchQuestion", { name: deleteTarget.value?.name ?? "" }).replace(
    /<\/?name>/g,
    "",
  ),
);

const tableCols = computed(() =>
  scope.value === "local"
    ? "grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_5.5rem_9rem_minmax(0,6rem)_4rem_2.25rem]"
    : "grid-cols-[minmax(0,1.4fr)_5.5rem_9rem_minmax(0,7rem)_4rem_2.25rem]",
);

const scopeOptions = computed(() => [
  { id: "local" as const, label: t("branchManage.scopeLocal") },
  { id: "remote" as const, label: t("branchManage.scopeRemote") },
]);

const activityOptions = computed(() => [
  { id: "all" as const, label: `${t("branchManage.filterAll")} (${activityCounts.value.all})` },
  {
    id: "active" as const,
    label: `${t("branchManage.filterActive")} (${activityCounts.value.active})`,
  },
  {
    id: "inactive" as const,
    label: `${t("branchManage.filterInactive")} (${activityCounts.value.inactive})`,
  },
]);

async function loadBranches(): Promise<void> {
  branches.value = await listBranches(props.project.path, true);
}

watch(
  () => props.project.path,
  (_path, _previous, onCleanup) => {
    let active = true;
    loading.value = true;
    error.value = null;
    void loadBranches()
      .catch((reason: unknown) => {
        if (active) {
          error.value = toUserMessage(reason) || t("branchManage.loadFailed");
          branches.value = [];
        }
      })
      .finally(() => {
        if (active) {
          loading.value = false;
        }
      });
    onCleanup(() => {
      active = false;
    });
  },
  { immediate: true },
);

async function handleRefresh(): Promise<void> {
  refreshing.value = true;
  try {
    await loadBranches();
  } catch (reason: unknown) {
    message.error(toUserMessage(reason) || t("branchManage.refreshFailed"));
  } finally {
    refreshing.value = false;
  }
}

function openDelete(branch: GitBranch): void {
  if (branch.isRemote || branch.isCurrent) {
    return;
  }
  deleteTarget.value = branch;
  deleteRemoteAlso.value = false;
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value || deleteBusy.value) {
    return;
  }
  const targetName = deleteTarget.value.name;
  const alsoRemote = deleteHasRemote.value && deleteRemoteAlso.value;
  deleteBusy.value = true;
  try {
    await deleteBranch(props.project.path, targetName, {
      force: true,
      deleteRemote: alsoRemote,
      remote: "origin",
    });
    deleteTarget.value = null;
    deleteRemoteAlso.value = false;
    await loadBranches();
    message.success(t("repo.deleteBranchSuccess", { name: targetName }));
  } catch (reason: unknown) {
    message.error(toUserMessage(reason) || t("branchManage.deleteFailed"));
  } finally {
    deleteBusy.value = false;
  }
}

function compareByTime(left: GitBranch, right: GitBranch, direction: SortDirection): number {
  const leftMs = parseAuthoredMs(left.tipAuthoredAt);
  const rightMs = parseAuthoredMs(right.tipAuthoredAt);
  if (leftMs === rightMs) {
    return left.name.localeCompare(right.name);
  }
  if (leftMs === null) {
    return 1;
  }
  if (rightMs === null) {
    return -1;
  }
  return direction === "desc" ? rightMs - leftMs : leftMs - rightMs;
}

function parseAuthoredMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = dayjs(trimmed);
  return parsed.isValid() ? parsed.valueOf() : null;
}

function statusLabel(branch: GitBranch): string {
  if (!branch.tipAuthoredAt.trim()) {
    return t("branchManage.statusUnknown");
  }
  return isBranchActive(branch.tipAuthoredAt)
    ? t("branchManage.statusActive")
    : t("branchManage.statusInactive");
}

function deleteDisabledTitle(branch: GitBranch): string {
  if (branch.isCurrent) {
    return t("branchManage.deleteCurrentDisabled");
  }
  if (branch.isRemote) {
    return t("branchManage.deleteRemoteDisabled");
  }
  return t("repo.deleteBranchAction");
}
</script>

<template>
  <AppLoadingScreen v-if="loading" />
  <main
    v-else
    class="bg-background text-foreground flex h-screen min-h-0 w-full flex-col overflow-hidden"
  >
    <AppWindowHeader height-class-name="h-11">
      <span class="truncate text-sm font-semibold">{{ t("branchManage.windowTitle") }}</span>
    </AppWindowHeader>

    <div class="border-border flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
      <div class="bg-muted/60 flex gap-0.5 rounded-md p-0.5" role="radiogroup">
        <button
          v-for="item in scopeOptions"
          :key="item.id"
          type="button"
          role="radio"
          :aria-checked="scope === item.id"
          :class="
            cn(
              'rounded px-2 py-1 text-[11px]',
              scope === item.id ? 'bg-background shadow-xs' : 'text-muted-foreground',
            )
          "
          @click="scope = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="bg-muted/60 flex gap-0.5 rounded-md p-0.5" role="radiogroup">
        <button
          v-for="item in activityOptions"
          :key="item.id"
          type="button"
          role="radio"
          :aria-checked="activity === item.id"
          :class="
            cn(
              'rounded px-2 py-1 text-[11px]',
              activity === item.id ? 'bg-background shadow-xs' : 'text-muted-foreground',
            )
          "
          @click="activity = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="ml-auto flex items-center gap-1.5">
        <Input
          v-model:value="search"
          size="small"
          class="w-52"
          :placeholder="t('branchManage.searchPlaceholder')"
          :aria-label="t('branchManage.searchPlaceholder')"
        />
        <Tooltip :title="t('repo.refresh')">
          <Button
            size="small"
            :aria-label="t('repo.refresh')"
            :disabled="loading || refreshing"
            :loading="refreshing"
            @click="void handleRefresh()"
          >
            <Icon name="RefreshCw" :size="14" />
          </Button>
        </Tooltip>
      </div>
    </div>

    <p
      v-if="error"
      class="text-destructive flex flex-1 items-center justify-center px-4 text-center text-sm"
    >
      {{ error }}
    </p>
    <Empty
      v-else-if="!loading && visibleBranches.length === 0"
      class="flex-1"
      :description="t('branchManage.emptyDescription')"
    >
      <template #image>
        <Icon name="GitBranch" :size="28" class="text-muted-foreground" />
      </template>
      <p class="text-sm font-medium">{{ t("branchManage.empty") }}</p>
    </Empty>
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div
        :class="
          cn(
            'border-border bg-muted/30 text-muted-foreground grid shrink-0 items-center gap-2 border-b px-3 py-1.5 text-[11px] font-medium',
            tableCols,
          )
        "
      >
        <span>{{ t("branchManage.columnBranch") }}</span>
        <span v-if="scope === 'local'">{{ t("branchManage.columnTracking") }}</span>
        <span>{{ t("branchManage.columnCommit") }}</span>
        <button
          type="button"
          class="hover:text-foreground inline-flex items-center gap-0.5 text-left"
          :aria-label="
            sortDir === 'desc' ? t('branchManage.sortTimeDesc') : t('branchManage.sortTimeAsc')
          "
          @click="sortDir = sortDir === 'desc' ? 'asc' : 'desc'"
        >
          {{ t("branchManage.columnTime") }}
          <Icon :name="sortDir === 'desc' ? 'ArrowDown' : 'ArrowUp'" :size="12" />
        </button>
        <span>{{ t("branchManage.columnAuthor") }}</span>
        <span>{{ t("branchManage.columnStatus") }}</span>
        <span class="text-right">{{ t("branchManage.columnActions") }}</span>
      </div>
      <ScrollArea class="min-h-0 flex-1">
        <div
          v-for="branch in visibleBranches"
          :key="branch.name"
          :class="cn('grid items-center gap-2 px-3 py-1.5 text-xs', tableCols)"
        >
          <span class="flex min-w-0 items-center gap-1">
            <HighlightText :text="branch.name" :query="search" class-name="truncate font-mono" />
            <Tag v-if="branch.isCurrent" class="shrink-0 text-[10px]">
              {{ t("branchManage.currentBranch") }}
            </Tag>
            <Tag v-else-if="branch.isDefault" class="shrink-0 text-[10px]">
              {{ t("branchManage.defaultBranch") }}
            </Tag>
          </span>
          <span v-if="scope === 'local'" class="text-muted-foreground truncate font-mono">
            {{ branch.upstream || t("branchManage.noTracking") }}
          </span>
          <span class="font-mono">{{
            branch.tipShortId.trim() || t("branchManage.noCommit")
          }}</span>
          <span class="tabular-nums">
            {{ formatCommitDateTime(branch.tipAuthoredAt) || t("branchManage.noCommit") }}
          </span>
          <span class="truncate">{{ branch.tipAuthorName }}</span>
          <span>{{ statusLabel(branch) }}</span>
          <Tooltip :title="deleteDisabledTitle(branch)">
            <Button
              size="small"
              type="text"
              danger
              :aria-label="t('repo.deleteBranchAction')"
              :disabled="branch.isRemote || branch.isCurrent"
              @click="openDelete(branch)"
            >
              <Icon name="Trash2" :size="12" />
            </Button>
          </Tooltip>
        </div>
      </ScrollArea>
    </div>

    <Modal
      :open="Boolean(deleteTarget)"
      :title="t('repo.deleteBranchTitle')"
      :ok-text="t('repo.deleteBranchAction')"
      :cancel-text="t('common.cancel')"
      ok-type="danger"
      :confirm-loading="deleteBusy"
      @update:open="(open: boolean) => !open && !deleteBusy && (deleteTarget = null)"
      @ok="void confirmDelete()"
    >
      <p class="text-sm">{{ deleteQuestion }}</p>
      <label v-if="deleteHasRemote" class="mt-3 flex items-center gap-2 text-sm">
        <Checkbox v-model:checked="deleteRemoteAlso" :disabled="deleteBusy" />
        {{ t("repo.deleteBranchRemoteCheckbox") }}
      </label>
    </Modal>
  </main>
</template>
