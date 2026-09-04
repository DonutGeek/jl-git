<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { Button, Empty, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import GitIdentityAvatar from "./GitIdentityAvatar.vue";
import { Icon } from "@/components/Icon";
import AppWindowHeader from "@/layouts/page/AppWindowHeader.vue";
import ResizableSplit from "@/layouts/default/components/ResizableSplit.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { useMessage } from "@/hooks/web/useMessage";
import { cn } from "@/lib/utils";
import { getCommitFileDiff, getLog } from "@/services/git";
import { openCommitHistoryWindow } from "@/services/window/historyWindows";
import { toUserMessage } from "@/types/error";
import type { GitCommitSummary, GitDiffResult } from "@/types/git";
import type { Project } from "@/types/project";
import { formatCommitDateTime } from "@/utils/formatCommitDateTime";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

defineOptions({ name: "FileHistoryWorkspace" });

const props = defineProps<{
  project: Project;
  filePath: string;
  initialRef: string | null;
}>();

const { t } = useI18n();
const message = useMessage();
const commits = ref<GitCommitSummary[]>([]);
const selectedId = ref<string | null>(null);
const diff = ref<GitDiffResult | null>(null);
const listError = ref<string | null>(null);
const diffError = ref<string | null>(null);
const listLoading = ref(true);
const diffLoading = ref(false);

const selected = computed(
  () => commits.value.find((commit) => commit.id === selectedId.value) ?? null,
);

watch(
  () => [props.project.path, props.filePath, props.initialRef] as const,
  ([path, filePath, initialRef], _previous, onCleanup) => {
    let active = true;
    listLoading.value = true;
    listError.value = null;
    void getLog(path, {
      limit: 100,
      ref: initialRef ?? undefined,
      all: initialRef ? undefined : true,
      path: filePath,
    })
      .then((result) => {
        if (!active) {
          return;
        }
        commits.value = result.commits;
        selectedId.value = result.commits[0]?.id ?? null;
      })
      .catch((reason: unknown) => {
        if (!active) {
          return;
        }
        listError.value = toUserMessage(reason) || t("fileHistory.loadCommitsFailed");
        commits.value = [];
        selectedId.value = null;
      })
      .finally(() => {
        if (active) {
          listLoading.value = false;
        }
      });
    onCleanup(() => {
      active = false;
    });
  },
  { immediate: true },
);

watch(
  () => [props.project.path, props.filePath, selected.value] as const,
  ([path, filePath, nextSelected], _previous, onCleanup) => {
    if (!nextSelected) {
      diff.value = null;
      diffError.value = null;
      diffLoading.value = false;
      return;
    }
    let active = true;
    diffLoading.value = true;
    diffError.value = null;
    const parentRev = nextSelected.parentIds[0];
    void getCommitFileDiff(path, {
      filePath,
      commitRev: nextSelected.id,
      parentRev: parentRev || undefined,
      encoding: DEFAULT_TEXT_ENCODING,
    })
      .then((result) => {
        if (active) {
          diff.value = result;
        }
      })
      .catch((reason: unknown) => {
        if (!active) {
          return;
        }
        diff.value = null;
        diffError.value = toUserMessage(reason) || t("fileHistory.loadDiffFailed");
      })
      .finally(() => {
        if (active) {
          diffLoading.value = false;
        }
      });
    onCleanup(() => {
      active = false;
    });
  },
  { immediate: true },
);

function openCommit(commitId: string): void {
  void openCommitHistoryWindow({
    projectId: props.project.id,
    commitId,
  }).catch((reason: unknown) => {
    message.error(reason);
  });
}
</script>

<template>
  <main class="bg-background text-foreground flex h-screen min-h-0 w-full flex-col overflow-hidden">
    <AppWindowHeader>
      <span
        class="truncate text-sm font-semibold"
        :title="t('fileHistory.windowTitle', { path: filePath })"
      >
        {{ t("fileHistory.windowTitle", { path: filePath }) }}
      </span>
      <span class="text-muted-foreground ml-2 truncate text-xs" :title="project.path">
        ({{ project.path }})
      </span>
    </AppWindowHeader>
    <div class="min-h-0 flex-1">
      <ResizableSplit
        orientation="horizontal"
        :default-ratio="28"
        :min-first-px="220"
        :min-second-px="420"
        storage-key="jlgit:split:file-history"
      >
        <template #first>
          <aside class="flex h-full min-h-0 flex-col">
            <p v-if="listLoading" class="text-muted-foreground px-3 py-4 text-sm">
              {{ t("fileHistory.loading") }}
            </p>
            <p v-else-if="listError" class="text-destructive px-3 py-4 text-sm">{{ listError }}</p>
            <Empty
              v-else-if="commits.length === 0"
              class="h-full"
              :description="t('fileHistory.emptyDescription')"
            >
              <template #image>
                <Icon name="GitCommitHorizontal" :size="28" class="text-muted-foreground" />
              </template>
              <p class="text-sm">{{ t("fileHistory.empty") }}</p>
            </Empty>
            <ScrollArea v-else class="min-h-0 flex-1">
              <button
                v-for="commit in commits"
                :key="commit.id"
                type="button"
                :class="
                  cn(
                    'flex w-full min-w-0 flex-col gap-0.5 px-3 py-1.5 text-left',
                    selectedId === commit.id ? 'bg-accent' : 'hover:bg-accent/60',
                  )
                "
                @click="selectedId = commit.id"
              >
                <p class="min-w-0 truncate text-xs font-medium" :title="commit.subject">
                  {{ commit.subject }}
                </p>
                <div class="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px]">
                  <GitIdentityAvatar
                    :name="commit.authorName"
                    :email="commit.authorEmail ?? null"
                    :label="commit.authorName"
                    compact
                  />
                  <span class="min-w-0 truncate">{{ commit.authorName }}</span>
                  <span class="shrink-0 font-mono">{{ commit.shortId }}</span>
                  <span class="ml-auto shrink-0 tabular-nums">
                    {{ formatCommitDateTime(commit.authoredAt) }}
                  </span>
                </div>
              </button>
            </ScrollArea>
          </aside>
        </template>
        <template #second>
          <section class="flex h-full min-h-0 flex-col">
            <Empty
              v-if="!selected"
              class="h-full"
              :description="t('fileHistory.selectCommitDescription')"
            >
              <template #image>
                <Icon name="FileSearch" :size="28" class="text-muted-foreground" />
              </template>
              <p class="text-sm">{{ t("fileHistory.selectCommit") }}</p>
            </Empty>
            <p v-else-if="diffLoading" class="text-muted-foreground p-4 text-sm">
              {{ t("fileHistory.loading") }}
            </p>
            <p v-else-if="diffError" class="text-destructive p-4 text-sm">{{ diffError }}</p>
            <p v-else-if="!diff" class="text-muted-foreground p-4 text-sm">
              {{ t("fileHistory.noDiff") }}
            </p>
            <template v-else>
              <div class="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2">
                <span class="font-mono text-[11px]">
                  {{ selected.parentIds[0]?.slice(0, 7) ?? t("repo.diffEmptyTree") }}
                  →
                  {{ selected.shortId }}
                </span>
                <Tooltip :title="t('fileHistory.viewCommitHistory')">
                  <Button size="small" type="text" @click="openCommit(selected.id)">
                    <template #icon>
                      <Icon name="ExternalLink" :size="14" />
                    </template>
                  </Button>
                </Tooltip>
              </div>
              <p v-if="diff.binary" class="text-muted-foreground p-4 text-sm">
                {{ t("repo.diffBinary") }}
              </p>
              <ScrollArea v-else class="min-h-0 flex-1">
                <pre class="font-mono text-[11px] leading-5 whitespace-pre-wrap px-3 py-2">{{
                  diff.patch || diff.newText || ""
                }}</pre>
              </ScrollArea>
            </template>
          </section>
        </template>
      </ResizableSplit>
    </div>
  </main>
</template>
