<script setup lang="ts">
import { computed } from "vue";

import { Select } from "antdv-next";

import { PROJECT_ICON_VALUES } from "@/types/project";
import { formatLucideIconLabel } from "@/utils/lucideIconRegistry";

defineOptions({ name: "ProjectIconSelect" });

const props = withDefaults(
  defineProps<{
    value: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  "update:value": [value: string];
}>();

const options = computed(() =>
  PROJECT_ICON_VALUES.map((icon) => ({
    value: icon,
    label: formatLucideIconLabel(icon),
  })),
);
</script>

<template>
  <Select
    class="w-full"
    :value="props.value"
    :options="options"
    :disabled="disabled"
    @update:value="(next) => emit('update:value', String(next ?? ''))"
  />
</template>
