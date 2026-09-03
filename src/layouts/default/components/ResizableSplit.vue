<script setup lang="ts">
import { computed, ref } from "vue";

import { Splitter, SplitterPanel } from "antdv-next";

defineOptions({ name: "ResizableSplit" });

/**
 * antdv-next Splitter 没有「记住分隔比例」的能力。
 * 这里只补 localStorage，不另做一套拖拽实现。
 */

const props = withDefaults(
  defineProps<{
    orientation?: "horizontal" | "vertical";
    defaultRatio?: number;
    minFirstPx?: number;
    minSecondPx?: number;
    storageKey?: string;
    className?: string;
  }>(),
  {
    orientation: "horizontal",
    defaultRatio: 30,
    minFirstPx: 160,
    minSecondPx: 200,
    storageKey: undefined,
    className: "",
  },
);

function readRatio(storageKey: string | undefined, fallback: number): number {
  if (!storageKey) {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 5 || value >= 95) {
      return fallback;
    }
    return value;
  } catch {
    return fallback;
  }
}

function writeRatio(storageKey: string, ratio: number): void {
  try {
    localStorage.setItem(storageKey, String(ratio));
  } catch {
    // ignore
  }
}

const ratio = ref(readRatio(props.storageKey, props.defaultRatio));
const firstDefault = computed(() => `${ratio.value}%`);

function handleResizeEnd(sizes: number[]): void {
  const next = sizes[0];
  if (typeof next !== "number" || !props.storageKey) {
    return;
  }
  if (next > 5 && next < 95) {
    ratio.value = next;
    writeRatio(props.storageKey, next);
  }
}
</script>

<template>
  <Splitter
    :orientation="orientation"
    class="h-full min-h-0 min-w-0"
    :class="className"
    @resize-end="handleResizeEnd"
  >
    <SplitterPanel :default-size="firstDefault" :min="minFirstPx" class="min-h-0 min-w-0">
      <slot name="first" />
    </SplitterPanel>
    <SplitterPanel :min="minSecondPx" class="min-h-0 min-w-0">
      <slot name="second" />
    </SplitterPanel>
  </Splitter>
</template>
