<script setup lang="ts">
import { computed } from "vue";

import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { DEFAULT_PROJECT_ICON } from "@/types/project";
import { isValidLucideIconName } from "@/utils/lucideIconRegistry";

defineOptions({ name: "ProjectIcon" });

const props = withDefaults(
  defineProps<{
    name?: string;
    className?: string;
  }>(),
  { name: DEFAULT_PROJECT_ICON, className: "" },
);

const resolved = computed(() =>
  props.name && isValidLucideIconName(props.name) ? props.name : DEFAULT_PROJECT_ICON,
);
</script>

<template>
  <Icon :name="resolved" :class="cn('size-4', className)" />
</template>
