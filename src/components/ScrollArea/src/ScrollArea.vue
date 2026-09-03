<script setup lang="ts">
import { ref } from "vue";

import { cn } from "@/lib/utils";

defineOptions({ name: "ScrollArea" });

/**
 * antdv-next 没有独立 Scrollbar。面板主滚动仍走这一层，
 * 避免业务里散落 overflow-auto（也方便以后换成虚拟列表）。
 */

withDefaults(
  defineProps<{
    orientation?: "vertical" | "horizontal" | "both";
  }>(),
  { orientation: "vertical" },
);

const viewport = ref<HTMLElement | null>(null);
defineExpose({ viewport });
</script>

<template>
  <div class="relative min-h-0 min-w-0">
    <div
      ref="viewport"
      data-slot="scroll-area-viewport"
      :class="
        cn(
          'h-full w-full',
          orientation === 'horizontal' && 'overflow-x-auto overflow-y-hidden',
          orientation === 'vertical' && 'overflow-y-auto overflow-x-hidden',
          orientation === 'both' && 'overflow-auto',
        )
      "
    >
      <slot />
    </div>
  </div>
</template>
