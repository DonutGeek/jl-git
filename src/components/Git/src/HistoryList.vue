<script setup lang="ts">
import { computed, ref } from "vue";

import { Button, Input, Spin, Tooltip, message } from "antdv-next";
import { useI18n } from "vue-i18n";

import GitIdentityAvatar from "./GitIdentityAvatar.vue";
import { HighlightText } from "@/components/Common";
import { Icon } from "@/components/Icon";
import { ScrollArea } from "@/components/ScrollArea";
import { useZustand } from "@/hooks/core/useZustand";
import { cn } from "@/lib/utils";
import { openBranchHistoryWindow } from "@/services/window/historyWindows";
import { useRepoStore, useRepoStoreWithOut } from "@/store/modules/repo";
import { toUserMessage } from "@/types/error";
import { formatCommitDateTime } from "@/utils/formatCommitDateTime";
import { resolveRepoProjectId } from "@/utils/resolveRepoProjectId";

defineOptions({ name: "HistoryList" });

withDefaults(
  defineProps<{
    allowOpenInNewWindow?: boolean;
  }>(),
  { allowOpenInNewWindow: true },
);

const { t } = useI18n();
const commits = useZustand(useRepoStore, (state) => state.commits);
const selectedCommitId = useZustand(useRepoStore, (state) => state.selectedCommitId);
const hasMore = useZustand(useRepoStore, (state) => state.hasMore);
const loading = useZustand(useRepoStore, (state) => state.loading);
const logRef = useZustand(useRepoStore, (state) => state.logRef);
const filter = ref("");
const loadingMore = ref(false);

const filtered = computed(() => {
  const query = filter.value.trim().toLowerCase();
  if (!query) {
    return commits.value;
  }
  return commits.value.filter(
    (commit) =>
      commit.subject.toLowerCase().includes(query) ||
      commit.shortId.toLowerCase().includes(query) ||
      commit.authorName.toLowerCase().includes(query),
  );
});

async function selectCommit(id: string): Promise<void> {
  try {
    await useRepoStoreWithOut().selectCommit(id);
  } catch (error) {
    message.error(toUserMessage(error));
  }
}

async function loadMore(): Promise<void> {
  if (!hasMore.value || loadingMore.value) {
    return;
  }
  loadingMore.value = true;
  try {
    await useRepoStoreWithOut().loadMoreLog();
  } catch (error) {
    message.error(toUserMessage(error));
  } finally {
    loadingMore.value = false;
  }
}

function openInNewWindow(): void {
  const projectId = resolveRepoProjectId();
  if (!projectId) {
    message.error(t("repo.historyOpenInNewWindowFailed"));
    return;
  }
  void openBranchHistoryWindow({
    projectId,
    ref: logRef.value,
  }).catch((error: unknown) => {
    message.error(toUserMessage(error) || t("repo.historyOpenInNewWindowFailed"));
  });
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <header class="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
      <Input
        v-model:value="filter"
        size="small"
        class="flex-1"
        :placeholder="t('repo.filter')"
        :aria-label="t('repo.filter')"
      />
      <Tooltip v-if="allowOpenInNewWindow" :title="t('repo.historyOpenInNewWindow')">
        <Button
          size="small"
          type="text"
          :aria-label="t('repo.historyOpenInNewWindow')"
          @click="openInNewWindow"
        >
          <Icon name="ExternalLink" :size="14" />
        </Button>
      </Tooltip>
    </header>
    <ScrollArea class="min-h-0 flex-1">
      <div
        v-if="loading && commits.length === 0"
        class="text-muted-foreground flex items-center gap-2 p-4 text-xs"
      >
        <Spin size="small" />
        {{ t("common.loading") }}
      </div>
      <div v-else-if="filtered.length === 0" class="text-muted-foreground p-4 text-xs">
        {{ t("repo.historyEmpty") }}
      </div>
      <template v-else>
        <button
          v-for="commit in filtered"
          :key="commit.id"
          type="button"
          :class="
            cn(
              'flex w-full items-start gap-2 px-2 py-1.5 text-left',
              selectedCommitId === commit.id ? 'bg-accent' : 'hover:bg-accent/60',
            )
          "
          @click="void selectCommit(commit.id)"
        >
          <GitIdentityAvatar
            :name="commit.authorName"
            :email="commit.authorEmail"
            :label="commit.authorName"
            compact
          />
          <span class="min-w-0 flex-1">
            <HighlightText
              :text="commit.subject"
              :query="filter"
              class-name="block truncate text-xs font-medium"
            />
            <span class="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
              <span class="font-mono">{{ commit.shortId }}</span>
              <span>{{ commit.authorName }}</span>
              <span>{{ formatCommitDateTime(commit.authoredAt) }}</span>
            </span>
          </span>
        </button>
        <div v-if="hasMore" class="p-2">
          <Button block size="small" :loading="loadingMore" @click="void loadMore()">
            <Icon name="ChevronDown" :size="14" />
            {{ t("repo.loadMore") }}
          </Button>
        </div>
      </template>
    </ScrollArea>
  </section>
</template>
