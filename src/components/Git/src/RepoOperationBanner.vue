<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";

import { Alert, Button } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { useMessage } from "@/hooks/web/useMessage";
import { useRepoStore, useRepoStoreWithOut } from "@/store/modules/repo";

defineOptions({ name: "RepoOperationBanner" });

const { t } = useI18n();
const message = useMessage();
const repoStore = useRepoStore();
const { repoState } = storeToRefs(repoStore);
const aborting = ref(false);

const visible = computed(() => Boolean(repoState.value?.merging));
const operationLabel = computed(() => {
  const kind = repoState.value?.kind;
  if (kind === "rebase") {
    return t("repo.operationRebase");
  }
  if (kind === "cherryPick") {
    return t("repo.operationCherryPick");
  }
  return t("repo.operationMerge");
});

async function handleAbort(): Promise<void> {
  aborting.value = true;
  try {
    await useRepoStoreWithOut().abortOperation();
    message.success(t("repo.abortOperationSuccess"));
  } catch (error) {
    message.error(error);
  } finally {
    aborting.value = false;
  }
}
</script>

<template>
  <Alert
    v-if="visible && repoState"
    type="warning"
    show-icon
    banner
    class="rounded-none border-x-0 px-3 py-1 text-xs"
  >
    <template #icon>
      <Icon name="TriangleAlert" :size="14" />
    </template>
    <span class="truncate font-medium">
      {{ t("repo.operationBanner", { operation: operationLabel }) }}
      ·
      {{
        repoState.conflictCount > 0
          ? t("repo.operationBannerConflict", { count: repoState.conflictCount })
          : t("repo.operationBannerReady")
      }}
    </span>
    <template #action>
      <Button type="link" size="small" :loading="aborting" @click="handleAbort">
        {{ t("repo.abortOperation") }}
      </Button>
    </template>
  </Alert>
</template>
