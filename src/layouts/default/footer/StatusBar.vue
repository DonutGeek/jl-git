<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";

import { Badge, Button, Spin, Tooltip, message } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { MultiAgentWindowButton } from "@/components/Agent";
import { GitIdentityAvatar } from "@/components/Git";
import DiskSpaceTooltip from "./DiskSpaceTooltip.vue";
import { useAppUpdateChecker } from "@/hooks/core/useAppUpdateChecker";
import { useZustand } from "@/hooks/core/useZustand";
import { cn } from "@/lib/utils";
import { gitService } from "@/services/git";
import {
  getAppInfo,
  getDiskSpace,
  listDiskVolumes,
  type SystemAppInfo,
  type SystemDiskSpace,
} from "@/services/system/system.info";
import { checkAppUpdate, installPendingAppUpdate } from "@/services/system/system.updater";
import { useAppUpdateStore } from "@/store/modules/appUpdate";
import { useLocaleStore } from "@/store/modules/locale";
import {
  selectLatestEntry,
  selectRepoEntries,
  useOpLogStore,
  useOpLogStoreWithOut,
} from "@/store/modules/opLog";
import { useRepoStore } from "@/store/modules/repo";
import { useSettingsDrawerStore } from "@/store/modules/setting";
import { useThemeStore } from "@/store/modules/theme";
import { toUserMessage } from "@/types/error";
import { formatBytes } from "@/utils/formatBytes";

import type { GitIdentity } from "@/types/git";

defineOptions({ name: "StatusBar" });

const { t } = useI18n();
const route = useRoute();
const isNewTab = computed(() => route.path.startsWith("/tab/"));

useAppUpdateChecker();

const themeStore = useThemeStore();
const localeStore = useLocaleStore();
const settingsDrawerStore = useSettingsDrawerStore();
const appUpdateStore = useAppUpdateStore();
const { mode } = storeToRefs(themeStore);
const { locale } = storeToRefs(localeStore);
const { open: settingsOpen } = storeToRefs(settingsDrawerStore);
const { availableUpdate } = storeToRefs(appUpdateStore);
const repoPath = useZustand(useRepoStore, (state) => state.repoPath);
const repoIdentity = useZustand(useRepoStore, (state) => state.identity);
const byRepo = useZustand(useOpLogStore, (state) => state.byRepo);
const panelOpen = useZustand(useOpLogStore, (state) => state.panelOpen);

const appInfo = ref<SystemAppInfo | null>(null);
const disk = ref<SystemDiskSpace | null>(null);
const diskVolumes = ref<SystemDiskSpace[]>([]);
const fallbackIdentity = ref<GitIdentity | null>(null);
const updating = ref(false);

const prefersDark =
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
const effectiveDark = computed(
  () => mode.value === "dark" || (mode.value === "system" && prefersDark),
);

const latestOp = computed(() => selectLatestEntry(selectRepoEntries(byRepo.value, repoPath.value)));
const identity = computed(() => repoIdentity.value ?? fallbackIdentity.value);
const identityLabel = computed(() =>
  identity.value?.name || identity.value?.email
    ? t("statusBar.gitIdentity", {
        name: identity.value?.name ?? identity.value?.email ?? "",
      })
    : t("statusBar.gitIdentityEmpty"),
);
const versionLabel = computed(() => {
  const name = t("common.productName");
  if (!appInfo.value) {
    return name;
  }
  const arch = appInfo.value.arch ? ` ${appInfo.value.arch}` : "";
  return `${name} ${appInfo.value.version}${arch}`;
});
const diskLabel = computed(() =>
  disk.value
    ? t("statusBar.diskAvailable", { size: formatBytes(disk.value.availableBytes) })
    : t("statusBar.diskUnknown"),
);
const opLogAria = computed(() => {
  if (latestOp.value?.status === "error") {
    return t("statusBar.opLogFailed");
  }
  if (latestOp.value?.status === "success") {
    return t("statusBar.opLogSuccess");
  }
  if (latestOp.value?.status === "running") {
    return t("statusBar.opLogRunning");
  }
  return t("statusBar.opLog");
});

onMounted(() => {
  let cancelled = false;
  void getAppInfo()
    .then((info) => {
      if (!cancelled) {
        appInfo.value = info;
      }
    })
    .catch(() => {
      if (!cancelled) {
        appInfo.value = { name: t("common.productName"), version: "1.0.1", arch: "", os: "" };
      }
    });
  onUnmounted(() => {
    cancelled = true;
  });
});

watch(
  repoPath,
  (path, _previous, onCleanup) => {
    let cancelled = false;
    void Promise.all([
      getDiskSpace(path ?? undefined).catch(() => null),
      listDiskVolumes().catch(() => [] as SystemDiskSpace[]),
    ]).then(([space, volumes]) => {
      if (cancelled) {
        return;
      }
      disk.value = space;
      diskVolumes.value = volumes;
    });
    onCleanup(() => {
      cancelled = true;
    });
  },
  { immediate: true },
);

watch(
  repoIdentity,
  (identityValue, _previous, onCleanup) => {
    if (identityValue) {
      fallbackIdentity.value = null;
      return;
    }
    let cancelled = false;
    void gitService
      .getGlobalIdentity()
      .then((next) => {
        if (!cancelled) {
          fallbackIdentity.value = next;
        }
      })
      .catch(() => {
        if (!cancelled) {
          fallbackIdentity.value = null;
        }
      });
    onCleanup(() => {
      cancelled = true;
    });
  },
  { immediate: true },
);

async function handleAppUpdate(): Promise<void> {
  if (updating.value || !availableUpdate.value) {
    return;
  }
  updating.value = true;
  const hide = message.loading(t("statusBar.updateDownloading"), 0);
  try {
    const info = await checkAppUpdate();
    if (!info) {
      useAppUpdateStore().setAvailableUpdate(null);
      hide();
      message.success(t("statusBar.updateUpToDate"));
      return;
    }
    useAppUpdateStore().setAvailableUpdate(info);
    await installPendingAppUpdate();
    hide();
  } catch (error) {
    hide();
    message.error(toUserMessage(error) || t("statusBar.updateFailed"));
  } finally {
    updating.value = false;
  }
}
</script>

<template>
  <div
    class="border-border bg-muted text-muted-foreground relative z-30 flex h-7 shrink-0 items-center justify-between gap-2 border-t px-2 text-[11px] select-none"
    role="contentinfo"
  >
    <div class="flex min-w-0 items-center gap-1.5">
      <span
        class="bg-primary text-primary-foreground inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-[8px] font-bold"
        aria-hidden="true"
      >
        JL
      </span>
      <span class="truncate font-medium" :title="versionLabel">{{ versionLabel }}</span>
      <Tooltip
        v-if="availableUpdate"
        :title="
          updating
            ? t('statusBar.updateInProgress')
            : t('statusBar.updateAvailable', {
                version: availableUpdate.version,
                current: availableUpdate.currentVersion,
              })
        "
      >
        <button
          type="button"
          class="rounded-md focus-visible:ring-ring shrink-0 focus-visible:ring-1 focus-visible:outline-none disabled:opacity-60"
          :aria-label="
            updating
              ? t('statusBar.updateInProgress')
              : t('statusBar.updateAvailable', {
                  version: availableUpdate.version,
                  current: availableUpdate.currentVersion,
                })
          "
          :aria-busy="updating"
          :disabled="updating"
          @click="void handleAppUpdate()"
        >
          <Badge class="h-5 px-1.5 py-0 text-[10px] font-semibold">
            <Spin v-if="updating" size="small" />
            <Icon v-else name="Download" :size="12" />
          </Badge>
        </button>
      </Tooltip>
    </div>

    <div class="flex shrink-0 items-center gap-1.5">
      <Tooltip :title="locale === 'zh-CN' ? t('statusBar.switchToEn') : t('statusBar.switchToZh')">
        <Button
          type="text"
          size="small"
          class="text-muted-foreground size-6 text-[10px] font-semibold tracking-tight"
          :aria-label="locale === 'zh-CN' ? t('statusBar.switchToEn') : t('statusBar.switchToZh')"
          @click="localeStore.toggleZhEn"
        >
          {{ locale === "zh-CN" ? t("statusBar.localeEn") : t("statusBar.localeZh") }}
        </Button>
      </Tooltip>

      <Tooltip :title="effectiveDark ? t('statusBar.switchToLight') : t('statusBar.switchToDark')">
        <Button
          type="text"
          size="small"
          class="text-muted-foreground size-6"
          :aria-label="effectiveDark ? t('statusBar.switchToLight') : t('statusBar.switchToDark')"
          @click="themeStore.toggleDayNight"
        >
          <Icon :name="effectiveDark ? 'Moon' : 'Sun'" :size="14" />
        </Button>
      </Tooltip>

      <template v-if="!isNewTab">
        <Tooltip>
          <template #title>
            <DiskSpaceTooltip :current="disk" :volumes="diskVolumes" />
          </template>
          <button
            type="button"
            :class="
              cn(
                'hover:bg-accent hover:text-accent-foreground inline-flex h-6 items-center gap-1 rounded-md px-1.5',
              )
            "
            :aria-label="t('statusBar.diskSpace')"
          >
            <Icon name="HardDrive" :size="14" />
            <span class="max-w-22 truncate">{{ diskLabel }}</span>
          </button>
        </Tooltip>

        <Tooltip :title="opLogAria">
          <Button
            type="text"
            size="small"
            :class="
              cn('size-6', panelOpen ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')
            "
            :aria-label="opLogAria"
            :aria-pressed="panelOpen"
            @click="useOpLogStoreWithOut().togglePanel"
          >
            <Spin v-if="latestOp?.status === 'running'" size="small" />
            <Icon
              v-else-if="latestOp?.status === 'success'"
              name="CheckCircle2"
              :size="14"
              class="text-primary"
            />
            <Icon
              v-else-if="latestOp?.status === 'error'"
              name="XCircle"
              :size="14"
              class="text-destructive"
            />
            <Icon v-else name="ScrollText" :size="14" />
          </Button>
        </Tooltip>

        <Tooltip :title="identityLabel">
          <div class="flex items-center">
            <GitIdentityAvatar
              :name="identity?.name ?? null"
              :email="identity?.email ?? null"
              :label="identityLabel"
              class-name="size-5 text-[9px]"
            />
          </div>
        </Tooltip>
      </template>

      <MultiAgentWindowButton :label="t('statusBar.multiAgent')" class-name="size-6" />

      <Tooltip :title="t('statusBar.settings')">
        <Button
          type="text"
          size="small"
          :class="
            cn(
              'size-6',
              settingsOpen ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
            )
          "
          :aria-label="t('statusBar.settings')"
          :aria-pressed="settingsOpen"
          @click="settingsDrawerStore.openDrawer()"
        >
          <Icon name="Settings" :size="14" />
        </Button>
      </Tooltip>
    </div>
  </div>
</template>
