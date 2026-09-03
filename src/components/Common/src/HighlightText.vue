<script setup lang="ts">
import { computed } from "vue";

import { cn } from "@/lib/utils";
import { findContiguousMatchRanges } from "@/utils/textHighlight";

defineOptions({ name: "HighlightText" });

const props = withDefaults(
  defineProps<{
    text: string;
    query: string;
    className?: string;
    markClassName?: string;
    title?: string;
  }>(),
  { className: "", markClassName: "", title: undefined },
);

/** 暗色下提高不透明度，避免搜索命中与底色糊成一片 */
const DEFAULT_MARK_CLASS =
  "rounded-sm bg-primary/20 text-inherit dark:bg-primary/45 dark:text-foreground";

const parts = computed(() => {
  const ranges = findContiguousMatchRanges(props.text, props.query);
  if (ranges.length === 0) {
    return [{ key: "all", text: props.text, marked: false }];
  }

  const next: Array<{ key: string; text: string; marked: boolean }> = [];
  let cursor = 0;
  for (const [index, range] of ranges.entries()) {
    if (cursor < range.start) {
      next.push({
        key: `plain-${cursor}`,
        text: props.text.slice(cursor, range.start),
        marked: false,
      });
    }
    next.push({
      key: `${range.start}-${range.end}-${index}`,
      text: props.text.slice(range.start, range.end),
      marked: true,
    });
    cursor = range.end;
  }
  if (cursor < props.text.length) {
    next.push({
      key: `tail-${cursor}`,
      text: props.text.slice(cursor),
      marked: false,
    });
  }
  return next;
});
</script>

<template>
  <span :class="className" :title="title">
    <template v-for="part in parts" :key="part.key">
      <mark v-if="part.marked" :class="cn(DEFAULT_MARK_CLASS, markClassName)">{{ part.text }}</mark>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
