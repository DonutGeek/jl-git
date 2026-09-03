<script setup lang="ts">
import { computed, ref } from "vue";

import { Button, Col, Form, FormItem, Input, Row, Select } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { useZustand } from "@/hooks/core/useZustand";
import { useProjectStore } from "@/store/modules/project";
import {
  MANAGE_ALL_GROUPS,
  MANAGE_DIRTY_ALL,
  MANAGE_DIRTY_CLEAN,
  MANAGE_DIRTY_DIRTY,
  MANAGE_SYNC_AHEAD,
  MANAGE_SYNC_ALL,
  MANAGE_SYNC_BEHIND,
  MANAGE_SYNC_DIVERGED,
  MANAGE_UNGROUPED,
  type ManageDirtyFilter,
  type ManageFilters,
  type ManageSortBy,
  type ManageSyncFilter,
} from "@/utils/projectManageFilter";

defineOptions({ name: "ProjectManageFilterForm" });

const props = withDefaults(
  defineProps<{
    draft: ManageFilters;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  draftChange: [key: keyof ManageFilters, value: ManageFilters[keyof ManageFilters]];
  submit: [];
  reset: [];
}>();

const { t } = useI18n();
const workspaces = useZustand(useProjectStore, (state) => state.workspaces);
const expanded = ref(false);

const groupOptions = computed(() => [
  { value: MANAGE_ALL_GROUPS, label: t("projectManager.manageFilterAll") },
  { value: MANAGE_UNGROUPED, label: t("projectManager.ungrouped") },
  ...workspaces.value
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((workspace) => ({ value: workspace.id, label: workspace.name })),
]);

const dirtyOptions = computed(() => [
  { value: MANAGE_DIRTY_ALL, label: t("projectManager.manageFilterDirtyAll") },
  { value: MANAGE_DIRTY_DIRTY, label: t("projectManager.manageFilterDirtyDirty") },
  { value: MANAGE_DIRTY_CLEAN, label: t("projectManager.manageFilterDirtyClean") },
]);

const syncOptions = computed(() => [
  { value: MANAGE_SYNC_ALL, label: t("projectManager.manageFilterSyncAll") },
  { value: MANAGE_SYNC_AHEAD, label: t("projectManager.manageFilterSyncAhead") },
  { value: MANAGE_SYNC_BEHIND, label: t("projectManager.manageFilterSyncBehind") },
  { value: MANAGE_SYNC_DIVERGED, label: t("projectManager.manageFilterSyncDiverged") },
]);

const sortOptions = computed(() => [
  { value: "lastOpened", label: t("projectManager.manageSortLastOpened") },
  { value: "name", label: t("projectManager.manageSortName") },
  { value: "path", label: t("projectManager.manageSortPath") },
  { value: "createdAt", label: t("projectManager.manageSortCreated") },
]);
</script>

<template>
  <Form
    class="border-border bg-muted/20 shrink-0 rounded-md border px-3 py-2.5"
    layout="vertical"
    :model="draft"
    @finish="emit('submit')"
  >
    <Row :gutter="[16, 8]">
      <Col :xs="24" :md="8">
        <FormItem class="mb-0" :label="t('projectManager.manageFilterKeyword')">
          <Input
            :value="draft.keyword"
            :placeholder="t('projectManager.manageFilterKeywordPlaceholder')"
            autocomplete="off"
            :disabled="disabled"
            @update:value="(next: string) => emit('draftChange', 'keyword', next)"
          />
        </FormItem>
      </Col>
      <Col :xs="24" :md="8">
        <FormItem class="mb-0" :label="t('projectManager.manageFilterGroup')">
          <Select
            class="w-full"
            :value="draft.group"
            :options="groupOptions"
            :disabled="disabled"
            @update:value="(next) => emit('draftChange', 'group', String(next ?? ''))"
          />
        </FormItem>
      </Col>
      <Col :xs="24" :md="8">
        <FormItem class="mb-0" :label="t('projectManager.manageSort')">
          <Select
            class="w-full"
            :value="draft.sortBy"
            :options="sortOptions"
            :disabled="disabled"
            @update:value="
              (next) => emit('draftChange', 'sortBy', String(next ?? 'lastOpened') as ManageSortBy)
            "
          />
        </FormItem>
      </Col>
      <template v-if="expanded">
        <Col :xs="24" :md="8">
          <FormItem class="mb-0" :label="t('projectManager.manageFilterDirty')">
            <Select
              class="w-full"
              :value="draft.dirty"
              :options="dirtyOptions"
              :disabled="disabled"
              @update:value="
                (next) =>
                  emit(
                    'draftChange',
                    'dirty',
                    String(next ?? MANAGE_DIRTY_ALL) as ManageDirtyFilter,
                  )
              "
            />
          </FormItem>
        </Col>
        <Col :xs="24" :md="8">
          <FormItem class="mb-0" :label="t('projectManager.manageFilterSync')">
            <Select
              class="w-full"
              :value="draft.sync"
              :options="syncOptions"
              :disabled="disabled"
              @update:value="
                (next) =>
                  emit('draftChange', 'sync', String(next ?? MANAGE_SYNC_ALL) as ManageSyncFilter)
              "
            />
          </FormItem>
        </Col>
      </template>
      <Col :xs="24" :md="expanded ? 8 : 24" class="flex items-end justify-end">
        <FormItem class="mb-0">
          <Button :disabled="disabled" @click="emit('reset')">
            <Icon name="RotateCcw" :size="14" />
            {{ t("projectManager.manageFilterReset") }}
          </Button>
          <Button type="primary" html-type="submit" class="ml-2" :disabled="disabled">
            <Icon name="Search" :size="14" />
            {{ t("projectManager.manageFilterSubmit") }}
          </Button>
          <Button type="text" :disabled="disabled" @click="expanded = !expanded">
            {{
              expanded
                ? t("projectManager.manageFilterCollapse")
                : t("projectManager.manageFilterExpand")
            }}
            <Icon :name="expanded ? 'ChevronUp' : 'ChevronDown'" :size="14" />
          </Button>
        </FormItem>
      </Col>
    </Row>
  </Form>
</template>
