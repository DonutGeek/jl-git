<script setup lang="ts">
import { computed } from "vue";

import { useI18n } from "vue-i18n";

import { ScrollArea } from "@/components/ScrollArea";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/utils/formatBytes";
import { withSoftWrapOpportunities } from "@/utils/softWrapText";

import type { SystemDiskSpace } from "@/services/system/system.info";

defineOptions({ name: "DiskSpaceTooltip" });

const props = defineProps<{
  current: SystemDiskSpace | null;
  volumes: readonly SystemDiskSpace[];
}>();

const { t } = useI18n();

function usedRatio(space: SystemDiskSpace): number {
  if (space.totalBytes <= 0) {
    return 0;
  }
  const used = Math.max(0, space.totalBytes - space.availableBytes);
  return Math.min(1, used / space.totalBytes);
}

function sameVolume(left: string, right: string): boolean {
  const normalize = (value: string): string =>
    value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return normalize(left) === normalize(right);
}

const ordered = computed(() => {
  const byPath = new Map<string, SystemDiskSpace>();
  for (const volume of props.volumes) {
    byPath.set(volume.path, volume);
  }
  if (props.current) {
    const exists = [...byPath.keys()].some((path) => sameVolume(path, props.current!.path));
    if (!exists) {
      byPath.set(props.current.path, props.current);
    }
  }
  const list = [...byPath.values()];
  if (!props.current) {
    return list;
  }
  return list.sort((left, right) => {
    const leftCurrent = sameVolume(left.path, props.current!.path) ? 0 : 1;
    const rightCurrent = sameVolume(right.path, props.current!.path) ? 0 : 1;
    if (leftCurrent !== rightCurrent) {
      return leftCurrent - rightCurrent;
    }
    return left.path.localeCompare(right.path);
  });
});

const needsScroll = computed(() => ordered.value.length >= 4);
</script>

<template>
  <span v-if="!current && ordered.length === 0">{{ t("statusBar.diskUnknown") }}</span>
  <div v-else-if="ordered.length <= 1" class="space-y-1.5 text-xs">
    <p class="font-medium">{{ t("statusBar.diskSpace") }}</p>
    <p class="text-background/70 break-words">
      {{ withSoftWrapOpportunities((ordered[0] ?? current)?.path ?? "") }}
    </p>
    <div
      class="bg-background/25 relative h-2 w-full overflow-hidden rounded-full"
      role="progressbar"
      :aria-valuenow="Math.round(usedRatio((ordered[0] ?? current)!) * 100)"
      :aria-valuemin="0"
      :aria-valuemax="100"
    >
      <div
        :class="
          cn(
            'absolute inset-y-0 left-0 rounded-full',
            usedRatio((ordered[0] ?? current)!) >= 0.9 ? 'bg-destructive' : 'bg-background',
          )
        "
        :style="{ width: `${Math.round(usedRatio((ordered[0] ?? current)!) * 100)}%` }"
      />
    </div>
    <p>
      {{
        t("statusBar.diskUsedPercent", {
          percent: Math.round(usedRatio((ordered[0] ?? current)!) * 100),
        })
      }}
      ·
      {{
        t("statusBar.diskAvailableFull", {
          size: formatBytes((ordered[0] ?? current)!.availableBytes),
        })
      }}
    </p>
    <p>
      {{ t("statusBar.diskTotal", { size: formatBytes((ordered[0] ?? current)!.totalBytes) }) }}
    </p>
  </div>
  <div v-else class="space-y-2 text-xs">
    <div class="flex items-baseline justify-between gap-3">
      <p class="font-medium">{{ t("statusBar.diskSpace") }}</p>
      <p class="text-background/70 shrink-0 text-[10px]">
        {{ t("statusBar.diskVolumeCount", { count: ordered.length }) }}
      </p>
    </div>
    <ScrollArea v-if="needsScroll" class="h-48 min-w-0">
      <div class="space-y-2.5 px-1">
        <div
          v-for="space in ordered"
          :key="space.path"
          :class="
            cn(
              'space-y-1 rounded-md px-1.5 py-1',
              current && sameVolume(space.path, current.path) && 'bg-background/20',
            )
          "
        >
          <div class="flex items-center gap-2">
            <p class="min-w-0 flex-1 truncate font-mono text-[11px]">{{ space.path }}</p>
            <span
              v-if="current && sameVolume(space.path, current.path)"
              class="text-background shrink-0 text-[10px] font-semibold"
            >
              {{ t("statusBar.diskCurrent") }}
            </span>
          </div>
        </div>
      </div>
    </ScrollArea>
    <div v-else class="space-y-2.5 px-1">
      <div
        v-for="space in ordered"
        :key="space.path"
        :class="
          cn(
            'space-y-1 rounded-md px-1.5 py-1',
            current && sameVolume(space.path, current.path) && 'bg-background/20',
          )
        "
      >
        <p class="truncate font-mono text-[11px]">{{ space.path }}</p>
      </div>
    </div>
    <p class="text-background/70 text-[10px] leading-snug">{{ t("statusBar.diskMultiHint") }}</p>
  </div>
</template>
