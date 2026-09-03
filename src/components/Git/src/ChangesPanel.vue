<script setup lang="ts">
import { computed, ref } from "vue";

import { Button, Input, Modal, Tooltip, message } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import MaterialFileIcon from "./MaterialFileIcon.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { useZustand } from "@/hooks/core/useZustand";
import { cn } from "@/lib/utils";
import { useRepoStore, useRepoStoreWithOut } from "@/store/modules/repo";
import { toUserMessage } from "@/types/error";
import type { GitStatusEntry } from "@/types/git";
import { getPathBasename } from "@/utils/getPathBasename";
import { isConflictEntry, isStagedChangeEntry, isUnstagedChangeEntry } from "@/utils/gitConflict";
import { gitStatusLetterClass, normalizeGitStatusLetter } from "@/utils/gitStatusStyle";

defineOptions({ name: "ChangesPanel" });

const EMPTY_ENTRIES: GitStatusEntry[] = [];
const { t } = useI18n();
const entries = useZustand(useRepoStore, (state) => state.status?.entries ?? EMPTY_ENTRIES);
const selectedChange = useZustand(useRepoStore, (state) => state.selectedChange);
const loading = useZustand(useRepoStore, (state) => state.loading);
const filter = ref("");
const discardTarget = ref<GitStatusEntry | null>(null);
const discarding = ref(false);

const query = computed(() => filter.value.trim().toLowerCase());

function matchesFilter(entry: GitStatusEntry): boolean {
  if (!query.value) {
    return true;
  }
  return (
    entry.path.toLowerCase().includes(query.value) ||
    getPathBasename(entry.path).toLowerCase().includes(query.value)
  );
}

const staged = computed(() =>
  entries.value.filter((entry) => isStagedChangeEntry(entry) && matchesFilter(entry)),
);
const unstaged = computed(() =>
  entries.value.filter((entry) => isUnstagedChangeEntry(entry) && matchesFilter(entry)),
);

function selectEntry(entry: GitStatusEntry, side: "index" | "worktree"): void {
  useRepoStoreWithOut().selectChange({ path: entry.path, side });
}

function statusLetter(entry: GitStatusEntry, side: "index" | "worktree"): string {
  const raw = side === "index" ? entry.indexStatus : entry.worktreeStatus;
  return normalizeGitStatusLetter(raw);
}

function statusClass(entry: GitStatusEntry, side: "index" | "worktree"): string {
  const raw = side === "index" ? entry.indexStatus : entry.worktreeStatus;
  return gitStatusLetterClass(raw, { conflict: isConflictEntry(entry) });
}

async function stagePaths(paths: string[]): Promise<void> {
  try {
    await useRepoStoreWithOut().stage(paths);
  } catch (error) {
    message.error(toUserMessage(error));
  }
}

async function unstagePaths(paths: string[]): Promise<void> {
  try {
    await useRepoStoreWithOut().unstage(paths);
  } catch (error) {
    message.error(toUserMessage(error));
  }
}

async function handleDiscard(): Promise<void> {
  if (!discardTarget.value) {
    return;
  }
  discarding.value = true;
  try {
    await useRepoStoreWithOut().discard([discardTarget.value.path]);
    discardTarget.value = null;
  } catch (error) {
    message.error(toUserMessage(error));
  } finally {
    discarding.value = false;
  }
}

function isSelected(entry: GitStatusEntry, side: "index" | "worktree"): boolean {
  return selectedChange.value?.path === entry.path && selectedChange.value.side === side;
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
      <Tooltip :title="t('repo.stageAll')">
        <Button
          size="small"
          type="text"
          :aria-label="t('repo.stageAll')"
          :disabled="unstaged.length === 0"
          @click="void stagePaths(unstaged.map((item) => item.path))"
        >
          <Icon name="ArrowUp" :size="14" />
        </Button>
      </Tooltip>
      <Tooltip :title="t('repo.unstageAll')">
        <Button
          size="small"
          type="text"
          :aria-label="t('repo.unstageAll')"
          :disabled="staged.length === 0"
          @click="void unstagePaths(staged.map((item) => item.path))"
        >
          <Icon name="ArrowDown" :size="14" />
        </Button>
      </Tooltip>
    </header>

    <ScrollArea class="min-h-0 flex-1">
      <div v-if="loading && entries.length === 0" class="text-muted-foreground p-4 text-xs">
        {{ t("common.loading") }}
      </div>
      <div
        v-else-if="staged.length === 0 && unstaged.length === 0"
        class="text-muted-foreground p-4 text-xs"
      >
        {{ t("repo.changesEmpty") }}
      </div>
      <template v-else>
        <div class="px-2 pt-2 text-xs font-medium">
          {{ t("repo.stagedCount", { count: staged.length }) }}
        </div>
        <button
          v-for="entry in staged"
          :key="`index-${entry.path}`"
          type="button"
          :class="
            cn(
              'flex w-full items-center gap-2 px-2 py-1 text-left text-xs',
              isSelected(entry, 'index') ? 'bg-accent' : 'hover:bg-accent/60',
            )
          "
          @click="selectEntry(entry, 'index')"
        >
          <span
            :class="cn('w-3.5 text-center font-mono font-semibold', statusClass(entry, 'index'))"
          >
            {{ statusLetter(entry, "index") }}
          </span>
          <MaterialFileIcon :name="entry.path" :is-dir="false" class-name="size-3.5" />
          <span class="min-w-0 flex-1 truncate">{{ getPathBasename(entry.path) }}</span>
          <Button
            size="small"
            type="text"
            :aria-label="t('repo.unstageFile', { path: entry.path })"
            @click.stop="void unstagePaths([entry.path])"
          >
            <Icon name="ArrowDown" :size="12" />
          </Button>
        </button>

        <div class="px-2 pt-3 text-xs font-medium">
          {{ t("repo.changesCount", { count: unstaged.length }) }}
        </div>
        <button
          v-for="entry in unstaged"
          :key="`worktree-${entry.path}`"
          type="button"
          :class="
            cn(
              'flex w-full items-center gap-2 px-2 py-1 text-left text-xs',
              isSelected(entry, 'worktree') ? 'bg-accent' : 'hover:bg-accent/60',
            )
          "
          @click="selectEntry(entry, 'worktree')"
        >
          <span
            :class="cn('w-3.5 text-center font-mono font-semibold', statusClass(entry, 'worktree'))"
          >
            {{ statusLetter(entry, "worktree") }}
          </span>
          <MaterialFileIcon :name="entry.path" :is-dir="false" class-name="size-3.5" />
          <span class="min-w-0 flex-1 truncate">{{ getPathBasename(entry.path) }}</span>
          <Button
            size="small"
            type="text"
            :aria-label="t('repo.stageFile', { path: entry.path })"
            @click.stop="void stagePaths([entry.path])"
          >
            <Icon name="ArrowUp" :size="12" />
          </Button>
          <Button
            size="small"
            type="text"
            danger
            :aria-label="t('repo.discardChanges')"
            @click.stop="discardTarget = entry"
          >
            <Icon name="RotateCcw" :size="12" />
          </Button>
        </button>
      </template>
    </ScrollArea>

    <Modal
      :open="Boolean(discardTarget)"
      :title="t('repo.discardChanges')"
      :ok-text="t('repo.discardChanges')"
      :cancel-text="t('common.cancel')"
      ok-type="danger"
      :confirm-loading="discarding"
      @update:open="(open: boolean) => !open && (discardTarget = null)"
      @ok="void handleDiscard()"
    >
      <p class="text-sm">{{ discardTarget?.path }}</p>
    </Modal>
  </section>
</template>
