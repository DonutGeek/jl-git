<script setup lang="ts">
import HistoryDetailPane from "./HistoryDetailPane.vue";
import HistoryList from "./HistoryList.vue";
import ResizableSplit from "@/layouts/default/components/ResizableSplit.vue";

defineOptions({ name: "HistoryWorkspace" });

withDefaults(
  defineProps<{
    allowOpenInNewWindow?: boolean;
  }>(),
  { allowOpenInNewWindow: true },
);
</script>

<template>
  <ResizableSplit
    class="h-full"
    orientation="horizontal"
    :default-ratio="36"
    :min-first-px="240"
    :min-second-px="280"
    storage-key="jlgit:split:history-detail"
  >
    <template #first>
      <HistoryList :allow-open-in-new-window="allowOpenInNewWindow" />
    </template>
    <template #second>
      <HistoryDetailPane />
    </template>
  </ResizableSplit>
</template>
