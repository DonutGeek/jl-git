<script setup lang="ts">
import { computed, ref } from "vue";

import { Button, Input, Tooltip, message } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { ScrollArea } from "@/components/ScrollArea";
import { useZustand } from "@/hooks/core/useZustand";
import { cn } from "@/lib/utils";
import { openBranchManageWindow } from "@/services/window/branchManageWindow";
import { useRepoStore, useRepoStoreWithOut } from "@/store/modules/repo";
import { toUserMessage } from "@/types/error";
import type { GitBranch } from "@/types/git";
import { filterAndSortBranches, readBranchListPrefs } from "@/utils/branchListPrefs";
import { resolveRepoProjectId } from "@/utils/resolveRepoProjectId";

defineOptions({ name: "BranchList" });

const { t } = useI18n();
const branches = useZustand(useRepoStore, (state) => state.branches);
const status = useZustand(useRepoStore, (state) => state.status);
const loading = useZustand(useRepoStore, (state) => state.loading);
const filter = ref("");
const checkingOut = ref<string | null>(null);
const selectedName = ref<string | null>(null);
const prefs = readBranchListPrefs();

const visible = computed(() => filterAndSortBranches(branches.value, prefs, filter.value));
const localBranches = computed(() => visible.value.filter((branch) => !branch.isRemote));
const remoteBranches = computed(() => visible.value.filter((branch) => branch.isRemote));

async function handleCheckout(branch: GitBranch): Promise<void> {
  if (branch.isCurrent || checkingOut.value) {
    return;
  }
  checkingOut.value = branch.name;
  try {
    await useRepoStoreWithOut().checkout(branch.name);
    selectedName.value = branch.name;
  } catch (error) {
    message.error(toUserMessage(error));
  } finally {
    checkingOut.value = null;
  }
}

function openManage(): void {
  const projectId = resolveRepoProjectId();
  if (!projectId) {
    message.error(t("branchManage.projectNotFound"));
    return;
  }
  void openBranchManageWindow({ projectId }).catch((error: unknown) => {
    message.error(toUserMessage(error) || t("branchManage.loadFailed"));
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
      <Tooltip :title="t('repo.branchSettings')">
        <Button size="small" type="text" :aria-label="t('repo.branchSettings')" @click="openManage">
          <Icon name="Settings" :size="14" />
        </Button>
      </Tooltip>
    </header>
    <ScrollArea class="min-h-0 flex-1">
      <p v-if="loading && branches.length === 0" class="text-muted-foreground p-3 text-xs">
        {{ t("common.loading") }}
      </p>
      <template v-else>
        <p class="text-muted-foreground px-3 pt-2 text-[11px] font-medium">
          {{ t("repo.localBranches") }}
        </p>
        <button
          v-for="branch in localBranches"
          :key="`local-${branch.name}`"
          type="button"
          :class="
            cn(
              'flex w-full items-center gap-2 px-3 py-1 text-left text-xs',
              selectedName === branch.name || branch.isCurrent ? 'bg-accent' : 'hover:bg-accent/60',
            )
          "
          @click="selectedName = branch.name"
          @dblclick="void handleCheckout(branch)"
        >
          <Icon name="GitBranch" :size="14" class="text-muted-foreground shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ branch.name }}</span>
          <span
            v-if="branch.isCurrent || status?.branch === branch.name"
            class="text-primary text-[10px]"
          >
            {{ t("repo.tagCurrentHead") }}
          </span>
        </button>
        <p class="text-muted-foreground px-3 pt-3 text-[11px] font-medium">
          {{ t("repo.remoteBranches") }}
        </p>
        <button
          v-for="branch in remoteBranches"
          :key="`remote-${branch.name}`"
          type="button"
          class="hover:bg-accent/60 flex w-full items-center gap-2 px-3 py-1 text-left text-xs"
          @click="selectedName = branch.name"
        >
          <Icon name="Cloud" :size="14" class="text-muted-foreground shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ branch.name }}</span>
        </button>
      </template>
    </ScrollArea>
  </section>
</template>
