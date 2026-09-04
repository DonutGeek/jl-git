<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";

import { Button, Empty, Spin } from "antdv-next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { ScrollArea } from "@/components/ScrollArea";
import { useMessage } from "@/hooks/web/useMessage";
import { cn } from "@/lib/utils";
import {
  selectRepoEntries,
  useOpLogStore,
  useOpLogStoreWithOut,
  type OpLogEntry,
  type OpLogLabel,
} from "@/store/modules/opLog";
import { useRepoStore } from "@/store/modules/repo";

defineOptions({ name: "OpLogPanel" });

const { t } = useI18n();
const message = useMessage();
const opLogStore = useOpLogStore();
const { panelOpen, byRepo, expandedIds } = storeToRefs(opLogStore);
const repoStore = useRepoStore();
const { repoPath } = storeToRefs(repoStore);
const entries = computed(() => selectRepoEntries(byRepo.value, repoPath.value).slice().reverse());

function labelKey(label: OpLogLabel): string {
  const map: Record<string, string> = {
    commit: "opLog.labelCommit",
    fetch: "opLog.labelFetch",
    pull: "opLog.labelPull",
    push: "opLog.labelPush",
    undo: "opLog.labelUndo",
    checkout: "opLog.labelCheckout",
    createBranch: "opLog.labelCreateBranch",
    publish: "opLog.labelPublish",
    deleteBranch: "opLog.labelDeleteBranch",
    renameBranch: "opLog.labelRenameBranch",
    merge: "opLog.labelMerge",
    stageAll: "opLog.labelStageAll",
    unstageAll: "opLog.labelUnstageAll",
    createTag: "opLog.labelCreateTag",
    deleteTag: "opLog.labelDeleteTag",
    pushTag: "opLog.labelPushTag",
    deleteRemoteTag: "opLog.labelDeleteRemoteTag",
    fetchTag: "opLog.labelFetchTag",
  };
  return map[label] ?? "opLog.labelUnknown";
}

function formatDuration(ms: number | undefined): string {
  if (ms == null) {
    return "";
  }
  return `${(ms / 1000).toFixed(3)}s`;
}

async function copyEntry(entry: OpLogEntry): Promise<void> {
  try {
    await writeText(entry.lines.map((line) => line.text).join("\n"));
    message.success(t("common.copy"));
  } catch (error) {
    message.error(error);
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="panelOpen" class="pointer-events-none fixed inset-0 z-40">
      <button
        type="button"
        class="bg-background/40 pointer-events-auto absolute inset-0"
        @click="useOpLogStoreWithOut().setPanelOpen(false)"
      />
      <section
        class="border-border bg-card pointer-events-auto absolute right-3 bottom-9 left-3 flex max-h-80 flex-col rounded-md border shadow-md"
        role="dialog"
      >
        <header class="border-border flex items-center justify-between border-b px-3 py-1.5">
          <div class="flex items-center gap-1.5 text-xs font-medium">
            <Icon name="ScrollText" :size="14" />
            {{ t("statusBar.opLog") }}
          </div>
          <Button type="text" size="small" @click="useOpLogStoreWithOut().setPanelOpen(false)">
            <template #icon>
              <Icon name="X" :size="14" />
            </template>
          </Button>
        </header>
        <ScrollArea class="min-h-0 flex-1">
          <Empty v-if="entries.length === 0" :description="t('opLog.empty')" class="py-8" />
          <ul v-else class="divide-border divide-y">
            <li v-for="entry in entries" :key="entry.id">
              <button
                type="button"
                class="hover:bg-accent/50 flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs"
                @click="useOpLogStoreWithOut().toggleExpanded(entry.id)"
              >
                <Spin v-if="entry.status === 'running'" size="small" />
                <Icon
                  v-else-if="entry.status === 'success'"
                  name="CheckCircle2"
                  :size="14"
                  class="text-primary"
                />
                <Icon v-else name="XCircle" :size="14" class="text-destructive" />
                <span class="min-w-0 flex-1 truncate">{{ t(labelKey(entry.label)) }}</span>
                <span class="text-muted-foreground shrink-0">{{
                  formatDuration(entry.elapsedMs)
                }}</span>
                <Icon
                  :name="expandedIds[entry.id] ? 'ChevronDown' : 'ChevronRight'"
                  :size="14"
                  class="text-muted-foreground"
                />
              </button>
              <div v-if="expandedIds[entry.id]" class="bg-muted/40 px-3 pb-2">
                <div class="mb-1 flex justify-end">
                  <Button type="text" size="small" @click="copyEntry(entry)">
                    <template #icon>
                      <Icon name="Copy" :size="12" />
                    </template>
                  </Button>
                </div>
                <pre
                  :class="
                    cn(
                      'text-muted-foreground max-h-40 overflow-hidden font-mono text-[11px] whitespace-pre-wrap',
                    )
                  "
                  >{{ entry.lines.map((line) => line.text).join("\n") }}</pre>
              </div>
            </li>
          </ul>
        </ScrollArea>
      </section>
    </div>
  </Teleport>
</template>
