<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { Button, Empty, Input, Select, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import MaterialFileIcon from "./MaterialFileIcon.vue";
import { Icon } from "@/components/Icon";
import AppWindowHeader from "@/layouts/page/AppWindowHeader.vue";
import ResizableSplit from "@/layouts/default/components/ResizableSplit.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { cn } from "@/lib/utils";
import { getBranchCompare, getBranchFileDiff, getCommit, getLog } from "@/services/git";
import { toUserMessage } from "@/types/error";
import type {
  BranchCompareMode,
  GitBranch,
  GitChangedFile,
  GitCommitDetail,
  GitCommitSummary,
  GitDiffResult,
} from "@/types/git";
import type { Project } from "@/types/project";
import { gitStatusLetterClass } from "@/utils/gitStatusStyle";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

defineOptions({ name: "BranchCompareWorkspace" });

const props = defineProps<{
  project: Project;
  branches: GitBranch[];
  initialMode: BranchCompareMode;
  initialBase: string;
  initialTarget: string;
}>();

type CompareView = "files" | "commits";

const { t } = useI18n();
const localBranches = computed(() => props.branches.filter((branch) => !branch.isRemote));
const currentBranch =
  props.branches.find((branch) => branch.isCurrent)?.name ?? localBranches.value[0]?.name ?? "";
const mode = ref<BranchCompareMode>(props.initialMode);
const base = ref(props.initialBase || currentBranch);
const target = ref(props.initialTarget);
const view = ref<CompareView>("files");
const files = ref<GitChangedFile[] | null>(null);
const selectedPath = ref<string | null>(null);
const fileFilter = ref("");
const fileError = ref<string | null>(null);
const diff = ref<GitDiffResult | null>(null);
const diffError = ref<string | null>(null);
const commitLists = ref<{
  baseOnly: GitCommitSummary[];
  targetOnly: GitCommitSummary[];
} | null>(null);
const selectedCommit = ref<GitCommitDetail | null>(null);
const loadingFiles = ref(false);
const loadingDiff = ref(false);

const upstream = computed(
  () => localBranches.value.find((branch) => branch.name === base.value)?.upstream ?? "",
);
const effectiveTarget = computed(() =>
  mode.value === "localUpstream" ? upstream.value : target.value,
);
const visibleFiles = computed(
  () =>
    files.value?.filter((file) =>
      file.path.toLowerCase().includes(fileFilter.value.trim().toLowerCase()),
    ) ?? [],
);
const summary = computed(() => summarizeFiles(files.value ?? []));

const modeOptions = computed(() => [
  { value: "branch", label: t("branchCompare.modeBranch") },
  { value: "localUpstream", label: t("branchCompare.modeLocalUpstream") },
]);
const sourceOptions = computed(() =>
  (mode.value === "localUpstream" ? localBranches.value : props.branches).map((branch) => ({
    value: branch.name,
    label: branch.name,
  })),
);
const targetOptions = computed(() =>
  props.branches.map((branch) => ({ value: branch.name, label: branch.name })),
);
const viewOptions = computed(() => [
  { id: "files" as const, label: t("branchCompare.files") },
  { id: "commits" as const, label: t("branchCompare.commits") },
]);

function setMode(next: unknown): void {
  mode.value = next === "localUpstream" ? "localUpstream" : "branch";
}

watch([mode, upstream], () => {
  if (mode.value === "localUpstream") {
    target.value = upstream.value;
  }
});

watch(
  () => [props.project.path, base.value, effectiveTarget.value, view.value] as const,
  ([path, nextBase, nextTarget, nextView], _previous, onCleanup) => {
    files.value = null;
    selectedPath.value = null;
    diff.value = null;
    fileError.value = null;
    commitLists.value = null;
    selectedCommit.value = null;
    if (!nextBase || !nextTarget) {
      return;
    }
    let cancelled = false;
    loadingFiles.value = true;
    if (nextView === "files") {
      void getBranchCompare(path, { base: nextBase, target: nextTarget })
        .then((result) => {
          if (cancelled) {
            return;
          }
          files.value = result.files;
          selectedPath.value = result.files[0]?.path ?? null;
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            fileError.value = toUserMessage(reason) || t("branchCompare.loadFilesFailed");
          }
        })
        .finally(() => {
          if (!cancelled) {
            loadingFiles.value = false;
          }
        });
    } else {
      void Promise.all([
        getLog(path, { ref: `${nextTarget}..${nextBase}`, limit: 100 }),
        getLog(path, { ref: `${nextBase}..${nextTarget}`, limit: 100 }),
      ])
        .then(([baseOnly, targetOnly]) => {
          if (!cancelled) {
            commitLists.value = { baseOnly: baseOnly.commits, targetOnly: targetOnly.commits };
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            fileError.value = toUserMessage(reason) || t("branchCompare.loadCommitsFailed");
          }
        })
        .finally(() => {
          if (!cancelled) {
            loadingFiles.value = false;
          }
        });
    }
    onCleanup(() => {
      cancelled = true;
    });
  },
  { immediate: true },
);

watch(
  () => [props.project.path, selectedPath.value, base.value, effectiveTarget.value] as const,
  ([path, nextPath, nextBase, nextTarget], _previous, onCleanup) => {
    diff.value = null;
    diffError.value = null;
    if (!nextPath || !nextBase || !nextTarget) {
      loadingDiff.value = false;
      return;
    }
    let cancelled = false;
    loadingDiff.value = true;
    void getBranchFileDiff(path, {
      base: nextBase,
      target: nextTarget,
      filePath: nextPath,
      encoding: DEFAULT_TEXT_ENCODING,
    })
      .then((result) => {
        if (!cancelled) {
          diff.value = result;
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          diffError.value = toUserMessage(reason) || t("branchCompare.loadDiffFailed");
        }
      })
      .finally(() => {
        if (!cancelled) {
          loadingDiff.value = false;
        }
      });
    onCleanup(() => {
      cancelled = true;
    });
  },
  { immediate: true },
);

function selectLocalBranch(nextBase: string): void {
  base.value = nextBase;
  if (mode.value === "localUpstream") {
    target.value = localBranches.value.find((branch) => branch.name === nextBase)?.upstream ?? "";
  }
}

function handleSourceChange(next: unknown): void {
  const value = String(next ?? "");
  if (mode.value === "localUpstream") {
    selectLocalBranch(value);
    return;
  }
  base.value = value;
}

function swapRefs(): void {
  const previousBase = base.value;
  base.value = effectiveTarget.value;
  target.value = previousBase;
}

async function selectCommit(commit: GitCommitSummary): Promise<void> {
  selectedCommit.value = null;
  try {
    selectedCommit.value = (await getCommit(props.project.path, commit.id)).commit;
  } catch (reason: unknown) {
    fileError.value = toUserMessage(reason) || t("branchCompare.loadCommitFailed");
  }
}

function summarizeFiles(list: readonly GitChangedFile[]) {
  return {
    total: list.length,
    added: list.filter((file) => file.status === "A").length,
    modified: list.filter((file) => !["A", "D"].includes(file.status)).length,
    deleted: list.filter((file) => file.status === "D").length,
  };
}
</script>

<template>
  <main class="bg-background text-foreground flex h-screen min-h-0 w-full flex-col overflow-hidden">
    <AppWindowHeader>
      <span
        class="truncate text-sm font-semibold"
        :title="t('branchCompare.windowTitle', { path: project.path })"
      >
        {{ t("branchCompare.windowTitle", { path: project.path }) }}
      </span>
    </AppWindowHeader>
    <section class="border-border flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
      <Icon name="GitCompareArrows" :size="18" class="shrink-0" />
      <Select
        :value="mode"
        class="w-44"
        :options="modeOptions"
        :aria-label="t('branchCompare.title')"
        @update:value="setMode"
      />
      <span class="shrink-0 text-sm font-medium">{{ t("branchCompare.source") }}</span>
      <Select
        :value="base"
        class="min-w-40 flex-1"
        :options="sourceOptions"
        :aria-label="t('branchCompare.source')"
        @update:value="handleSourceChange"
      />
      <Tooltip :title="t('branchCompare.swap')">
        <Button
          size="small"
          :aria-label="t('branchCompare.swap')"
          :disabled="mode === 'localUpstream'"
          @click="swapRefs"
        >
          <Icon name="ArrowLeftRight" :size="14" />
        </Button>
      </Tooltip>
      <span class="shrink-0 text-sm font-medium">{{ t("branchCompare.target") }}</span>
      <Select
        :value="effectiveTarget"
        class="min-w-40 flex-1"
        :options="targetOptions"
        :disabled="mode === 'localUpstream'"
        :aria-label="t('branchCompare.target')"
        @update:value="(next) => (target = String(next ?? ''))"
      />
      <div class="border-border flex rounded-md border p-0.5" role="tablist">
        <button
          v-for="item in viewOptions"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="view === item.id"
          :class="
            cn(
              'rounded px-3 py-1 text-sm',
              view === item.id && 'bg-primary text-primary-foreground',
            )
          "
          @click="view = item.id"
        >
          {{ item.label }}
        </button>
      </div>
    </section>
    <p
      v-if="mode === 'localUpstream' && !effectiveTarget"
      class="border-border text-muted-foreground shrink-0 border-b px-4 py-2 text-xs"
    >
      {{ t("branchCompare.noUpstream") }}
    </p>
    <ResizableSplit
      v-if="view === 'files'"
      orientation="horizontal"
      :default-ratio="25"
      :min-first-px="200"
      :min-second-px="420"
      storage-key="jlgit:split:branch-compare-files"
    >
      <template #first>
        <aside class="flex h-full min-h-0 flex-col">
          <div class="border-border border-b px-3 py-2 text-xs font-medium">
            {{ t("branchCompare.changedFiles", summary) }}
          </div>
          <div class="p-2">
            <Input
              v-model:value="fileFilter"
              size="small"
              :placeholder="t('branchCompare.filterFiles')"
              :aria-label="t('branchCompare.filterFiles')"
            />
          </div>
          <ScrollArea class="min-h-0 flex-1">
            <p v-if="fileError" class="text-destructive p-3 text-xs">{{ fileError }}</p>
            <p v-else-if="loadingFiles" class="text-muted-foreground p-3 text-xs">
              {{ t("branchCompare.loading") }}
            </p>
            <template v-else-if="visibleFiles.length">
              <button
                v-for="file in visibleFiles"
                :key="file.path"
                type="button"
                :class="
                  cn(
                    'flex h-7 w-full min-w-0 items-center gap-1 px-2 text-left text-xs',
                    selectedPath === file.path ? 'bg-accent' : 'hover:bg-accent/60',
                  )
                "
                @click="selectedPath = file.path"
              >
                <span
                  :class="
                    cn(
                      'w-3.5 shrink-0 text-center font-mono text-[11px] font-semibold',
                      gitStatusLetterClass(file.status),
                    )
                  "
                >
                  {{ file.status }}
                </span>
                <MaterialFileIcon :name="file.path" :is-dir="false" class-name="size-3.5" />
                <span class="min-w-0 flex-1 truncate" :title="file.path">{{ file.path }}</span>
              </button>
            </template>
            <Empty v-else :description="t('branchCompare.noFilesDescription')">
              <template #image>
                <Icon name="Files" :size="28" class="text-muted-foreground" />
              </template>
              <p class="text-sm">{{ t("branchCompare.noFiles") }}</p>
            </Empty>
          </ScrollArea>
        </aside>
      </template>
      <template #second>
        <section class="flex h-full min-h-0 flex-col">
          <p v-if="diffError" class="text-destructive p-4 text-sm">{{ diffError }}</p>
          <Empty
            v-else-if="!selectedPath"
            class="h-full"
            :description="t('branchCompare.selectFileDescription')"
          >
            <template #image>
              <Icon name="FileSearch" :size="28" class="text-muted-foreground" />
            </template>
            <p class="text-sm">{{ t("branchCompare.selectFile") }}</p>
          </Empty>
          <p v-else-if="loadingDiff || !diff" class="text-muted-foreground p-4 text-sm">
            {{ t("branchCompare.loading") }}
          </p>
          <p v-else-if="diff.binary" class="text-muted-foreground p-4 text-sm">
            {{ t("repo.diffBinary") }}
          </p>
          <ScrollArea v-else class="min-h-0 flex-1">
            <pre class="font-mono text-[11px] leading-5 whitespace-pre-wrap px-3 py-2">{{
              diff.patch || diff.newText || ""
            }}</pre>
          </ScrollArea>
        </section>
      </template>
    </ResizableSplit>
    <div
      v-else
      class="grid min-h-0 flex-1 grid-cols-[minmax(15rem,1fr)_minmax(15rem,1fr)_minmax(22rem,1.3fr)]"
    >
      <section class="border-border min-w-0 border-r">
        <h2 class="border-border truncate border-b px-3 py-2 text-sm font-medium">
          {{ t("branchCompare.baseOnly", { branch: base }) }}
        </h2>
        <ScrollArea class="h-[calc(100%-2.5rem)]">
          <button
            v-for="commit in commitLists?.baseOnly ?? []"
            :key="commit.id"
            type="button"
            class="hover:bg-accent/60 block w-full border-b px-3 py-2 text-left text-xs"
            @click="void selectCommit(commit)"
          >
            <p class="text-muted-foreground font-mono">{{ commit.shortId }}</p>
            <p class="truncate">{{ commit.subject }}</p>
          </button>
          <p v-if="!commitLists?.baseOnly.length" class="text-muted-foreground p-3 text-xs">
            {{ t("branchCompare.noUniqueCommits") }}
          </p>
        </ScrollArea>
      </section>
      <section class="border-border min-w-0 border-r">
        <h2 class="border-border truncate border-b px-3 py-2 text-sm font-medium">
          {{ t("branchCompare.targetOnly", { branch: effectiveTarget }) }}
        </h2>
        <ScrollArea class="h-[calc(100%-2.5rem)]">
          <button
            v-for="commit in commitLists?.targetOnly ?? []"
            :key="commit.id"
            type="button"
            class="hover:bg-accent/60 block w-full border-b px-3 py-2 text-left text-xs"
            @click="void selectCommit(commit)"
          >
            <p class="text-muted-foreground font-mono">{{ commit.shortId }}</p>
            <p class="truncate">{{ commit.subject }}</p>
          </button>
          <p v-if="!commitLists?.targetOnly.length" class="text-muted-foreground p-3 text-xs">
            {{ t("branchCompare.noUniqueCommits") }}
          </p>
        </ScrollArea>
      </section>
      <section class="min-w-0 p-4">
        <Empty
          v-if="!selectedCommit"
          class="h-full"
          :description="t('branchCompare.selectCommitDescription')"
        >
          <template #image>
            <Icon name="GitCommitHorizontal" :size="28" class="text-muted-foreground" />
          </template>
          <p class="text-sm">{{ t("branchCompare.selectCommit") }}</p>
        </Empty>
        <template v-else>
          <h2 class="text-sm font-semibold">{{ selectedCommit.subject }}</h2>
          <p class="text-muted-foreground mt-1 font-mono text-xs">{{ selectedCommit.id }}</p>
          <p class="text-muted-foreground mt-3 text-xs">
            {{ selectedCommit.authorName }} · {{ selectedCommit.authoredAt }}
          </p>
          <pre class="mt-4 text-xs whitespace-pre-wrap">{{ selectedCommit.body }}</pre>
        </template>
      </section>
    </div>
  </main>
</template>
