<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";

import { Avatar } from "antdv-next";

import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { loadAvatarObjectUrl } from "@/utils/avatarUrl";

defineOptions({ name: "GitIdentityAvatar" });

const props = withDefaults(
  defineProps<{
    name: string | null;
    email: string | null;
    label: string;
    className?: string;
    compact?: boolean;
  }>(),
  { className: "", compact: false },
);

const objectUrl = ref<string | null>(null);

watch(
  () => [props.email, props.name, props.compact] as const,
  ([email, name, compact], _previous, onCleanup) => {
    objectUrl.value = null;
    if (!email?.trim() && !name?.trim()) {
      return;
    }

    let createdUrl: string | null = null;
    let cancelled = false;
    void loadAvatarObjectUrl(email, name, compact ? 64 : 96)
      .then((url) => {
        if (cancelled) {
          if (url) {
            URL.revokeObjectURL(url);
          }
          return;
        }
        createdUrl = url;
        objectUrl.value = url;
      })
      .catch(() => {
        if (!cancelled) {
          objectUrl.value = null;
        }
      });

    onCleanup(() => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    });
  },
  { immediate: true },
);

onUnmounted(() => {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
  }
});
</script>

<template>
  <Avatar
    :alt="label"
    :src="objectUrl ?? undefined"
    :class="cn('rounded-md', className)"
    :size="20"
  >
    <template #icon>
      <Icon name="User" :size="12" />
    </template>
  </Avatar>
</template>
