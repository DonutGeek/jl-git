<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";

import { Button, Spin, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import MaterialFileIcon from "./MaterialFileIcon.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { useMessage } from "@/hooks/web/useMessage";
import { cn } from "@/lib/utils";
import { gitService } from "@/services/git";
import { openFileHistoryWindow } from "@/services/window/historyWindows";
import { useRepoStore } from "@/store/modules/repo";
import { toUserMessage } from "@/types/error";
import type { GitDiffResult, GitStatusEntry } from "@/types/git";
import { isConflictStatus } from "@/utils/gitConflict";
import { gitStatusLetterClass, normalizeGitStatusLetter } from "@/utils/gitStatusStyle";
import { resolveRepoProjectId } from "@/utils/resolveRepoProjectId";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

defineOptions({ name: "ChangesPreviewPane" });

const EMPTY_ENTRIES: GitStatusEntry[] = [];
const { t } = useI18n();
const message = useMessage();
const repoStore = useRepoStore();
const { repoPath, selectedChange, status } = storeToRefs(repoStore);
const entries = computed(() => status.value?.entries ?? EMPTY_ENTRIES);
const encoding = ref(DEFAULT_TEXT_ENCODING);
const diffHidden = ref(false);
const diff = ref<GitDiffResult | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const statusEntry = computed(() =>
  selectedChange.value
    ? entries.value.find((entry) => entry.path === selectedChange.value?.path)
    : undefined,
);
const rawStatusCode = computed(() => {
  if (!statusEntry.value || !selectedChange.value) {
    return null;
  }
  return selectedChange.value.side === "index"
    ? statusEntry.value.indexStatus
    : statusEntry.value.worktreeStatus;
});
const statusLetter = computed(() =>
  rawStatusCode.value ? normalizeGitStatusLetter(rawStatusCode.value) : null,
);
const statusConflict = computed(() =>
  statusEntry.value
    ? isConflictStatus(statusEntry.value.indexStatus, statusEntry.value.worktreeStatus)
    : false,
);
const baseLabel = computed(() =>
  selectedChange.value?.side === "index" ? t("repo.diffBaseStaged") : t("repo.diffBaseUnstaged"),
);
const localLabel = computed(() =>
  selectedChange.value?.side === "index" ? t("repo.diffLocalStaged") : t("repo.diffLocalUnstaged"),
);

watch(
  () => [repoPath.value, selectedChange.value, encoding.value] as const,
  ([path, change], _previous, onCleanup) => {
    diffHidden.value = false;
    if (!path || !change) {
      diff.value = null;
      error.value = null;
      loading.value = false;
      return;
    }
    let cancelled = false;
    loading.value = true;
    error.value = null;
    void gitService
      .getDiff(path, {
        filePath: change.path,
        staged: change.side === "index",
        encoding: encoding.value,
      })
      .then((result) => {
        if (!cancelled) {
          diff.value = result;
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          diff.value = null;
          error.value = toUserMessage(loadError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          loading.value = false;
        }
      });
    onCleanup(() => {
      cancelled = true;
    });
  },
  { immediate: true },
);

function openFileHistory(): void {
  if (!selectedChange.value) {
    return;
  }
  const projectId = resolveRepoProjectId();
  if (!projectId) {
    message.error(t("repo.diffOpenFileHistoryFailed"));
    return;
  }
  void openFileHistoryWindow({
    projectId,
    filePath: selectedChange.value.path,
  }).catch((reason: unknown) => {
    message.error(reason);
  });
}
</script>

<template>
  <div
    v-if="!selectedChange"
    class="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center"
  >
    <Icon name="FileText" :size="40" class="text-muted-foreground opacity-50" />
    <p class="text-sm font-medium">{{ t("repo.diffPreviewTitle") }}</p>
    <p class="text-muted-foreground max-w-sm text-xs">{{ t("repo.diffPreviewHint") }}</p>
  </div>
  <div v-else class="bg-background flex h-full min-h-0 flex-col overflow-hidden">
    <div class="border-border flex h-8 shrink-0 items-center gap-1.5 border-b px-2">
      <Tooltip :title="diffHidden ? t('repo.diffShow') : t('repo.diffHide')">
        <Button size="small" type="text" @click="diffHidden = !diffHidden">
          <template #icon>
            <Icon :name="diffHidden ? 'EyeOff' : 'Eye'" :size="14" />
          </template>
        </Button>
      </Tooltip>
      <span
        v-if="statusLetter && rawStatusCode"
        :class="
          cn(
            'w-3.5 shrink-0 text-center font-mono text-[11px] leading-none font-semibold',
            gitStatusLetterClass(rawStatusCode, { conflict: statusConflict }),
          )
        "
      >
        {{ statusLetter }}
      </span>
      <Icon v-if="statusConflict" name="TriangleAlert" :size="14" class="text-destructive" />
      <MaterialFileIcon :name="selectedChange.path" :is-dir="false" class-name="size-3.5" />
      <span class="min-w-0 truncate font-mono text-xs" :title="selectedChange.path">
        {{ selectedChange.path }}
      </span>
      <Tooltip :title="t('repo.viewFileHistory')">
        <Button size="small" type="text" @click="openFileHistory">
          <template #icon>
            <Icon name="History" :size="14" />
          </template>
        </Button>
      </Tooltip>
    </div>
    <div
      v-if="statusConflict"
      class="border-border text-muted-foreground border-b px-2 py-1 text-xs"
    >
      {{ t("repo.conflictPreviewActionHint") }}
    </div>
    <div v-if="diffHidden" class="flex min-h-0 flex-1 items-center justify-center">
      <p class="text-muted-foreground text-sm">{{ t("repo.diffHide") }}</p>
    </div>
    <div
      v-else-if="loading"
      class="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm"
    >
      <Spin size="small" />
      {{ t("common.loading") }}
    </div>
    <div
      v-else-if="error"
      class="text-destructive flex flex-1 items-center justify-center px-4 text-center text-sm"
    >
      {{ error }}
    </div>
    <div
      v-else-if="diff?.binary"
      class="text-muted-foreground flex flex-1 items-center justify-center px-4 text-sm"
    >
      {{ t("repo.diffBinary") }}
    </div>
    <ScrollArea v-else class="min-h-0 flex-1">
      <div class="text-muted-foreground border-b px-3 py-1 text-[11px]">
        {{ baseLabel }} → {{ localLabel }}
      </div>
      <pre class="font-mono text-[11px] leading-5 whitespace-pre-wrap px-3 py-2">{{
        diff?.patch || diff?.newText || ""
      }}</pre>
    </ScrollArea>
  </div>
</template>
