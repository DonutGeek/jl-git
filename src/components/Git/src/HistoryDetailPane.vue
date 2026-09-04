<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";

import { Spin, Tag } from "antdv-next";
import { useI18n } from "vue-i18n";

import GitIdentityAvatar from "./GitIdentityAvatar.vue";
import MaterialFileIcon from "./MaterialFileIcon.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { cn } from "@/lib/utils";
import { useRepoStore } from "@/store/modules/repo";
import { formatCommitDateTime } from "@/utils/formatCommitDateTime";
import { getPathBasename } from "@/utils/getPathBasename";
import { gitStatusLetterClass, normalizeGitStatusLetter } from "@/utils/gitStatusStyle";

defineOptions({ name: "HistoryDetailPane" });

const { t } = useI18n();
const repoStore = useRepoStore();
const { selectedCommitDetail: detail, detailLoading, selectedCommitId } = storeToRefs(repoStore);

const files = computed(() => detail.value?.diffs[0]?.files ?? []);
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div
      v-if="!selectedCommitId"
      class="text-muted-foreground flex flex-1 items-center justify-center px-4 text-center text-xs"
    >
      {{ t("repo.commitDetailHint") }}
    </div>
    <div v-else-if="detailLoading && !detail" class="flex flex-1 items-center justify-center gap-2">
      <Spin size="small" />
      <span class="text-muted-foreground text-xs">{{ t("common.loading") }}</span>
    </div>
    <template v-else-if="detail">
      <header class="border-border shrink-0 space-y-2 border-b px-3 py-3">
        <p class="text-sm font-medium">{{ detail.subject }}</p>
        <p v-if="detail.body" class="text-muted-foreground whitespace-pre-wrap text-xs">
          {{ detail.body }}
        </p>
        <div class="flex items-center gap-2 text-xs">
          <GitIdentityAvatar
            :name="detail.authorName"
            :email="detail.authorEmail"
            :label="detail.authorName"
            compact
          />
          <span>{{ detail.authorName }}</span>
          <span class="text-muted-foreground">{{ formatCommitDateTime(detail.authoredAt) }}</span>
          <Tag class="font-mono text-[10px]">{{ detail.shortId }}</Tag>
        </div>
      </header>
      <ScrollArea class="min-h-0 flex-1">
        <div class="px-3 py-2 text-xs font-medium">
          {{ t("repo.commitChangedFiles") }} · {{ files.length }}
        </div>
        <div
          v-for="file in files"
          :key="file.path"
          class="flex items-center gap-2 px-3 py-1 text-xs"
        >
          <span
            :class="
              cn('w-3.5 text-center font-mono font-semibold', gitStatusLetterClass(file.status))
            "
          >
            {{ normalizeGitStatusLetter(file.status) }}
          </span>
          <MaterialFileIcon :name="file.path" :is-dir="false" class-name="size-3.5" />
          <span class="min-w-0 flex-1 truncate" :title="file.path">{{
            getPathBasename(file.path)
          }}</span>
        </div>
      </ScrollArea>
    </template>
  </section>
</template>
