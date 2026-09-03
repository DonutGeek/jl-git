<script setup lang="ts">
import { computed } from "vue";

import { MorphIcon } from "morphicons/vue";

import { resolveLucideIconNode } from "./resolveLucideIcon";

defineOptions({ name: "AppIcon" });

const props = withDefaults(
  defineProps<{
    name: string;
    size?: number | string;
    strokeWidth?: number;
  }>(),
  { size: 16, strokeWidth: 2 },
);

/** name 变化时 MorphIcon 会在两套 Lucide 路径之间做 morph */
const iconNode = computed(() => resolveLucideIconNode(props.name));
const pixelSize = computed(() =>
  typeof props.size === "number" ? props.size : Number(props.size) || 16,
);
</script>

<template>
  <MorphIcon
    :icon="iconNode"
    :size="pixelSize"
    :stroke-width="strokeWidth"
    color="currentColor"
    spring="snappy"
  />
</template>
