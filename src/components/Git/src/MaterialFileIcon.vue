<script setup lang="ts">
import { computed } from "vue";

import { cn } from "@/lib/utils";
import { resolveMaterialIconUrl } from "@/utils/materialFileIcon";

defineOptions({ name: "MaterialFileIcon" });

const props = withDefaults(
  defineProps<{
    name: string;
    isDir: boolean;
    className?: string;
    decorative?: boolean;
  }>(),
  { className: "", decorative: true },
);

const src = computed(() => resolveMaterialIconUrl(props.name, props.isDir));
</script>

<template>
  <img
    :src="src"
    alt=""
    draggable="false"
    :class="cn('shrink-0 object-contain', className)"
    :aria-hidden="decorative ? true : undefined"
  />
</template>
