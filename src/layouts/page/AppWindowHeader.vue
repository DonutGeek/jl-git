<script setup lang="ts">
import { computed } from "vue";

import { useWindowChromeLayout } from "@/hooks/core/useWindowChromeLayout";
import { cn } from "@/lib/utils";

defineOptions({ name: "AppWindowHeader" });

const props = withDefaults(
  defineProps<{
    className?: string;
    /** 默认 h-12；多仓鲸灵等可用 h-11 */
    heightClassName?: string;
  }>(),
  { className: "", heightClassName: "h-12" },
);

const { headerPaddingClass, isMacOverlay } = useWindowChromeLayout();

const headerClass = computed(() =>
  cn(
    "border-border bg-muted/40 flex shrink-0 items-center border-b px-4",
    props.heightClassName,
    headerPaddingClass.value,
    props.className,
  ),
);
</script>

<template>
  <header :class="headerClass" :data-tauri-drag-region="isMacOverlay ? true : undefined">
    <div
      class="flex min-w-0 items-center gap-2"
      :data-tauri-drag-region="isMacOverlay ? true : undefined"
    >
      <slot />
    </div>
    <div class="h-full min-w-2 flex-1" :data-tauri-drag-region="isMacOverlay ? true : undefined" />
  </header>
</template>
