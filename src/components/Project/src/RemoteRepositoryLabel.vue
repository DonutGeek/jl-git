<script setup lang="ts">
import { onUnmounted, ref } from "vue";

import { Tooltip, message } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { toUserMessage } from "@/types/error";
import { copyToClipboard } from "@/utils/clipboard";
import { toBrowsableRemoteUrl, type RemoteRepository } from "@/utils/remoteRepository";

defineOptions({ name: "RemoteRepositoryLabel" });

const props = withDefaults(
  defineProps<{
    remote: RemoteRepository;
    className?: string;
  }>(),
  { className: "" },
);

const emit = defineEmits<{
  open: [url: string];
}>();

const { t } = useI18n();
const copied = ref(false);
let copiedTimer: number | null = null;

onUnmounted(() => {
  if (copiedTimer !== null) {
    window.clearTimeout(copiedTimer);
  }
});

async function copyRemoteUrl(): Promise<void> {
  try {
    await copyToClipboard(props.remote.url);
    copied.value = true;
    if (copiedTimer !== null) {
      window.clearTimeout(copiedTimer);
    }
    copiedTimer = window.setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch (error) {
    message.error(toUserMessage(error) || t("repo.copyFailed"));
  }
}

function handleDoubleClick(): void {
  const browseUrl = toBrowsableRemoteUrl(props.remote.url);
  if (!browseUrl) {
    message.error(t("repo.openRemoteUnsupported"));
    return;
  }
  emit("open", browseUrl);
}
</script>

<template>
  <div :class="cn('ml-auto inline-flex max-w-[46%] min-w-0 shrink-0', className)">
    <Tooltip :title="copied ? t('repo.copySuccess') : t('repo.copy')">
      <span
        role="button"
        tabindex="0"
        class="text-primary focus-visible:ring-ring inline-flex w-max max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-sm font-mono text-xs hover:underline focus-visible:ring-2 focus-visible:outline-none"
        :title="remote.url"
        @click.stop.prevent="void copyRemoteUrl()"
        @dblclick.stop.prevent="handleDoubleClick"
        @keydown.enter.stop.prevent="void copyRemoteUrl()"
        @keydown.space.stop.prevent="void copyRemoteUrl()"
      >
        <Icon name="GitFork" :size="14" class="shrink-0" />
        <span class="truncate">{{ remote.repositoryName }}</span>
      </span>
    </Tooltip>
  </div>
</template>
