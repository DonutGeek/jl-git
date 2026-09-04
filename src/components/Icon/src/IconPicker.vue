<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { Button, Empty, Input, Pagination, Popover, Tooltip } from "antdv-next";
import { refDebounced } from "@vueuse/core";
import { useI18n } from "vue-i18n";

import Icon from "./Icon.vue";

import {
  LUCIDE_ICON_NAMES,
  LUCIDE_ICON_PAGE_SIZE,
  filterLucideIconNames,
  formatLucideIconLabel,
} from "@/utils/lucideIconRegistry";

defineOptions({ name: "IconPicker" });

const props = withDefaults(
  defineProps<{
    value: string;
    disabled?: boolean;
    allowClear?: boolean;
    icons?: readonly string[];
    pageSize?: number;
  }>(),
  {
    disabled: false,
    allowClear: true,
    icons: undefined,
    pageSize: LUCIDE_ICON_PAGE_SIZE,
  },
);

const emit = defineEmits<{
  "update:value": [value: string];
}>();

const { t, te } = useI18n();
const open = ref(false);
const keyword = ref("");
const keywordDebounced = refDebounced(keyword, 300);
const currentPage = ref(1);

const sourceIcons = computed(() =>
  props.icons && props.icons.length > 0 ? props.icons : LUCIDE_ICON_NAMES,
);

const filteredIcons = computed(() =>
  filterLucideIconNames(keywordDebounced.value, sourceIcons.value),
);

const pageIcons = computed(() => {
  const start = (currentPage.value - 1) * props.pageSize;
  return filteredIcons.value.slice(start, start + props.pageSize);
});

const selectedLabel = computed(() => (props.value ? resolveIconLabel(props.value) : ""));

watch(keywordDebounced, () => {
  currentPage.value = 1;
});

watch(filteredIcons, (list) => {
  const maxPage = Math.max(1, Math.ceil(list.length / props.pageSize));
  if (currentPage.value > maxPage) {
    currentPage.value = maxPage;
  }
});

function resolveIconLabel(name: string): string {
  const key = `projectManager.projectIcons.${name}`;
  return te(key) ? t(key) : formatLucideIconLabel(name);
}

function handleOpenChange(next: boolean): void {
  if (props.disabled) {
    open.value = false;
    return;
  }
  open.value = next;
  if (!next) {
    keyword.value = "";
    currentPage.value = 1;
  }
}

function handleSelect(name: string): void {
  emit("update:value", name);
  open.value = false;
  keyword.value = "";
  currentPage.value = 1;
}

function handleTriggerValueChange(next: string): void {
  if (!next) {
    emit("update:value", "");
  }
}

/** 触发器 allow-clear 与 TreeSelect 一样；拦截清空点击，避免连带打开面板 */
function handleTriggerClear(event: MouseEvent): void {
  if (!(event.target instanceof Element) || !event.target.closest(".ant-input-clear-icon")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  emit("update:value", "");
}

function handlePageChange(page: number): void {
  currentPage.value = page;
}
</script>

<template>
  <Popover
    :open="open"
    trigger="click"
    placement="bottomLeft"
    :disabled="disabled"
    @open-change="handleOpenChange"
  >
    <Input
      class="w-full"
      :value="selectedLabel"
      readonly
      :disabled="disabled"
      :placeholder="t('common.pleaseSelect')"
      :allow-clear="allowClear && !disabled"
      @update:value="handleTriggerValueChange"
      @mousedown.capture="handleTriggerClear"
      @click.capture="handleTriggerClear"
    >
      <template #prefix>
        <Icon v-if="value" :name="value" :size="16" />
      </template>
    </Input>
    <template #content>
      <div class="flex w-96 flex-col gap-2">
        <Input
          v-model:value="keyword"
          allow-clear
          :placeholder="t('projectManager.searchProjectIcons')"
        >
          <template #prefix>
            <Icon name="Search" :size="14" />
          </template>
        </Input>
        <div v-if="pageIcons.length > 0" class="grid grid-cols-6 gap-1">
          <Tooltip v-for="name in pageIcons" :key="name" :title="resolveIconLabel(name)">
            <Button
              type="text"
              size="small"
              class="size-8 p-0"
              :class="name === value ? 'bg-primary/15 text-primary' : undefined"
              @click="handleSelect(name)"
            >
              <Icon :name="name" :size="16" />
            </Button>
          </Tooltip>
        </div>
        <Empty v-else :description="t('projectManager.projectIconNoMatch')" />
        <div class="flex items-center justify-between gap-2">
          <span class="text-muted-foreground text-xs">
            {{ t("projectManager.iconPickerResultCount", { count: filteredIcons.length }) }}
          </span>
          <Pagination
            v-if="filteredIcons.length > pageSize"
            size="small"
            simple
            :current="currentPage"
            :page-size="pageSize"
            :total="filteredIcons.length"
            :show-size-changer="false"
            @update:current="handlePageChange"
          />
        </div>
      </div>
    </template>
  </Popover>
</template>
