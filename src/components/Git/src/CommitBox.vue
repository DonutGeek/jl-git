<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";

import { Button, Checkbox, Input, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import GitIdentityAvatar from "./GitIdentityAvatar.vue";
import { Icon } from "@/components/Icon";
import { useHasAgentApiKey } from "@/hooks/core/useHasAgentApiKey";
import { useShortcutAction } from "@/hooks/core/useShortcutAction";
import { useMessage } from "@/hooks/web/useMessage";
import { generateCommitMessage, toastAiFailure } from "@/services/ai";
import { useLocaleStore } from "@/store/modules/locale";
import { useRepoStore, useRepoStoreWithOut } from "@/store/modules/repo";
import { useSettingsDrawerStore } from "@/store/modules/setting";
import type { GitStatusEntry } from "@/types/git";
import { isStagedChangeEntry } from "@/utils/gitConflict";
import { hasConfiguredGitIdentity } from "@/utils/gitIdentity";

defineOptions({ name: "CommitBox" });

const props = withDefaults(
  defineProps<{
    /** 仓库页不可见时注销提交快捷键，避免仪表盘误触发 */
    active?: boolean;
  }>(),
  { active: true },
);

const EMPTY_ENTRIES: GitStatusEntry[] = [];
const { t } = useI18n();
const message = useMessage();
const hasApiKey = useHasAgentApiKey();
const settingsDrawerStore = useSettingsDrawerStore();
const { locale } = storeToRefs(useLocaleStore());
const repoStore = useRepoStore();
const { commitMessage, identity, status, repoPath } = storeToRefs(repoStore);
const entries = computed(() => status.value?.entries ?? EMPTY_ENTRIES);
const pushAfterCommit = ref(false);
const committing = ref(false);
const generating = ref(false);

const stagedCount = computed(
  () => entries.value.filter((entry) => isStagedChangeEntry(entry)).length,
);
const hasIdentity = computed(() => hasConfiguredGitIdentity(identity.value));
const identityLabel = computed(() =>
  hasIdentity.value
    ? t("repo.gitIdentity", { name: identity.value?.name ?? identity.value?.email ?? "" })
    : t("repo.gitIdentityDefault"),
);
const working = computed(() => committing.value || generating.value);
const canCommit = computed(
  () => !working.value && stagedCount.value > 0 && Boolean(commitMessage.value.trim()),
);

async function handleCommit(): Promise<void> {
  if (!hasIdentity.value) {
    message.error(t("repo.errors.noGitIdentity"));
    settingsDrawerStore.openDrawer("git");
    return;
  }
  if (status.value?.detached) {
    message.error(t("repo.commitDetachedHint"));
    return;
  }
  if (!repoPath.value || !canCommit.value) {
    return;
  }

  committing.value = true;
  try {
    await useRepoStoreWithOut().holdLoading(async () => {
      await useRepoStoreWithOut().commit();
      if (pushAfterCommit.value) {
        const current = status.value?.branch;
        try {
          await useRepoStoreWithOut().push({
            remote: "origin",
            repoPath: repoPath.value ?? undefined,
            ...(current && !status.value?.upstream
              ? { branch: current, setUpstream: true }
              : current
                ? { branch: current }
                : {}),
          });
        } catch (pushError) {
          message.error(pushError);
        }
      }
    });
    message.success(t("repo.commitSuccess"));
  } catch (error) {
    message.error(error);
  } finally {
    committing.value = false;
  }
}

useShortcutAction(
  "commit",
  () => {
    if (canCommit.value) {
      void handleCommit();
    }
  },
  () => props.active,
);

async function handleGenerate(): Promise<void> {
  if (!hasApiKey.value) {
    settingsDrawerStore.openDrawer("ai");
    return;
  }
  if (!repoPath.value || generating.value) {
    return;
  }
  generating.value = true;
  try {
    const next = await generateCommitMessage(repoPath.value, locale.value);
    useRepoStoreWithOut().setCommitMessage(next);
  } catch (error) {
    toastAiFailure(message, error);
  } finally {
    generating.value = false;
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-2 p-3">
    <div class="flex shrink-0 items-center justify-between gap-2">
      <label class="flex items-center gap-2 text-xs">
        <Checkbox v-model:checked="pushAfterCommit" :disabled="working" />
        {{ t("repo.pushToRemote") }}
      </label>
      <Tooltip :title="!hasApiKey ? t('common.aiApiKeyRequired') : t('repo.generateCommitMessage')">
        <Button
          size="small"
          type="text"
          :disabled="!repoPath"
          :loading="generating"
          @click="handleGenerate"
        >
          <template #icon>
            <Icon name="Sparkles" :size="14" />
          </template>
          {{ generating ? t("repo.aiGenerating") : t("repo.aiGenerate") }}
        </Button>
      </Tooltip>
    </div>
    <div class="min-h-0 flex-1">
      <Input.TextArea
        :value="commitMessage"
        :disabled="working"
        :placeholder="t('repo.commitMessagePlaceholder')"
        class="h-full min-h-16 resize-none text-xs"
        @update:value="(next) => useRepoStoreWithOut().setCommitMessage(String(next ?? ''))"
      />
    </div>
    <div class="flex shrink-0 items-center justify-between gap-2">
      <button
        type="button"
        class="flex min-w-0 items-center gap-1.5"
        @click="settingsDrawerStore.openDrawer('git')"
      >
        <GitIdentityAvatar
          :name="identity?.name ?? null"
          :email="identity?.email ?? null"
          :label="identityLabel"
          compact
        />
        <span class="text-muted-foreground truncate text-xs">{{ identityLabel }}</span>
      </button>
      <Button
        type="primary"
        size="small"
        :disabled="!canCommit"
        :loading="committing"
        @click="handleCommit"
      >
        {{ t("repo.commit") }}
      </Button>
    </div>
  </div>
</template>
