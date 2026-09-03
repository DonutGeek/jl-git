<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useI18n } from "vue-i18n";

import { AppLoadingScreen } from "@/components/Common";
import HistoryWorkspace from "./HistoryWorkspace.vue";
import AppWindowHeader from "@/layouts/page/AppWindowHeader.vue";
import { beginRepoSwitch, useRepoStoreWithOut } from "@/store/modules/repo";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";

defineOptions({ name: "BranchHistoryWorkspace" });

const props = withDefaults(
  defineProps<{
    project: Project;
    initialRef: string | null;
    initialCommitId?: string;
    windowTitle?: string;
  }>(),
  { initialCommitId: undefined, windowTitle: undefined },
);

const { t } = useI18n();
const ready = ref(false);
const error = ref<string | null>(null);

const title = computed(() => {
  if (props.windowTitle) {
    return props.windowTitle;
  }
  return props.initialRef
    ? t("branchHistory.windowTitle", { ref: props.initialRef })
    : t("branchHistory.windowTitleAll");
});

watch(
  () => [props.project.path, props.initialRef, props.initialCommitId] as const,
  ([path, initialRef, initialCommitId], _previous, onCleanup) => {
    ready.value = false;
    error.value = null;
    beginRepoSwitch(path);
    let active = true;
    void (async () => {
      try {
        await useRepoStoreWithOut().loadAll(path);
        if (!active) {
          return;
        }
        if (useRepoStoreWithOut().logRef !== initialRef) {
          await useRepoStoreWithOut().selectLogRef(initialRef);
        }
        if (initialCommitId) {
          await useRepoStoreWithOut().selectCommit(initialCommitId);
        }
        if (active) {
          ready.value = true;
        }
      } catch (reason: unknown) {
        if (active) {
          error.value = toUserMessage(reason) || t("branchHistory.loadFailed");
          ready.value = false;
        }
      }
    })();
    onCleanup(() => {
      active = false;
    });
  },
  { immediate: true },
);
</script>

<template>
  <AppLoadingScreen v-if="!ready && !error" />
  <main
    v-else
    class="bg-background text-foreground flex h-screen min-h-0 w-full flex-col overflow-hidden"
  >
    <AppWindowHeader>
      <span class="truncate text-sm font-semibold" :title="title">{{ title }}</span>
    </AppWindowHeader>
    <p
      v-if="error"
      class="text-destructive flex flex-1 items-center justify-center px-4 text-center text-sm"
    >
      {{ error }}
    </p>
    <HistoryWorkspace v-if="ready" :allow-open-in-new-window="false" />
  </main>
</template>
