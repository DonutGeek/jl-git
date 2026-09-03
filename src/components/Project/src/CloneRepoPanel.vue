<script setup lang="ts">
import { computed, ref } from "vue";

import { Button, Col, Form, FormItem, Input, Row, message } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import ExistingRemoteCloneDialog from "./ExistingRemoteCloneDialog.vue";
import ProjectIconSelect from "./ProjectIconSelect.vue";
import WorkspaceSelectMenu from "./WorkspaceSelectMenu.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { cloneRepository } from "@/services/git/git.clone";
import { projectService } from "@/services/project";
import { useProjectStoreWithOut } from "@/store/modules/project";
import { toUserMessage } from "@/types/error";
import {
  DEFAULT_PROJECT_ICON,
  type ProjectIcon as ProjectIconName,
  type ProjectRemoteMatch,
} from "@/types/project";
import { joinCloneDestPath, repoNameFromCloneUrl } from "@/utils/gitClonePath";

defineOptions({ name: "CloneRepoPanel" });

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  open: [projectId: string];
}>();

const { t } = useI18n();
const url = ref("");
const path = ref("");
const suggestedRepoName = ref("");
const alias = ref("");
const aliasEdited = ref(false);
const projectIcon = ref<ProjectIconName>(DEFAULT_PROJECT_ICON);
const workspaceId = ref("");
const cloning = ref(false);
const picking = ref(false);
const remoteMatches = ref<ProjectRemoteMatch[]>([]);
const pendingCloneOpenAfter = ref<boolean | null>(null);

const busy = computed(
  () => cloning.value || picking.value || pendingCloneOpenAfter.value !== null || props.disabled,
);
const canSubmit = computed(
  () => !busy.value && url.value.trim().length > 0 && path.value.trim().length > 0,
);

function resetForm(): void {
  url.value = "";
  path.value = "";
  suggestedRepoName.value = "";
  alias.value = "";
  aliasEdited.value = false;
  projectIcon.value = DEFAULT_PROJECT_ICON;
  workspaceId.value = "";
}

function handleUrlChange(nextUrl: string): void {
  url.value = nextUrl;
  const repoName = repoNameFromCloneUrl(nextUrl);
  suggestedRepoName.value = repoName;
  if (!aliasEdited.value && repoName) {
    alias.value = repoName;
  }
}

async function pickParentDirectory(): Promise<void> {
  if (busy.value) {
    return;
  }
  const pickPromise = projectService.pickDirectory();
  picking.value = true;
  try {
    const selected = await pickPromise;
    if (!selected) {
      return;
    }
    const name = suggestedRepoName.value || repoNameFromCloneUrl(url.value) || "repository";
    suggestedRepoName.value = name;
    path.value = joinCloneDestPath(selected, name);
    if (!aliasEdited.value) {
      alias.value = name;
    }
  } catch (error) {
    message.error(toUserMessage(error));
  } finally {
    picking.value = false;
  }
}

async function runClone(openAfter: boolean, skipRemoteWarn = false): Promise<void> {
  const remoteUrl = url.value.trim();
  const destPath = path.value.trim();
  if (!remoteUrl) {
    message.error(t("cloneRepo.urlRequired"));
    return;
  }
  if (!destPath) {
    message.error(t("cloneRepo.pathRequired"));
    return;
  }
  if (cloning.value || picking.value || props.disabled) {
    return;
  }
  if (!skipRemoteWarn && pendingCloneOpenAfter.value !== null) {
    return;
  }

  cloning.value = true;
  try {
    if (!skipRemoteWarn) {
      try {
        const uniqueness = await projectService.checkUniqueness({ remoteUrl });
        if (uniqueness.kind === "existingRemote" && uniqueness.matches.length > 0) {
          remoteMatches.value = uniqueness.matches;
          pendingCloneOpenAfter.value = openAfter;
          return;
        }
      } catch (error) {
        console.warn("remote uniqueness check skipped", error);
      }
    }

    const cloned = await cloneRepository(remoteUrl, destPath);
    const input = {
      path: cloned.path,
      name: alias.value.trim() || undefined,
      workspaceId: workspaceId.value || undefined,
      icon: projectIcon.value,
    };
    const result = openAfter
      ? await useProjectStoreWithOut().addAndOpen(input)
      : await useProjectStoreWithOut().addProject(input);

    resetForm();
    message.success(
      openAfter
        ? t("cloneRepo.success", { name: result.project.name })
        : t("cloneRepo.cloneAndContinueSuccess", { name: result.project.name }),
    );
    if (openAfter) {
      emit("open", result.project.id);
    }
  } catch (error) {
    message.error(toUserMessage(error));
  } finally {
    cloning.value = false;
  }
}

function continueClone(): void {
  const openAfter = pendingCloneOpenAfter.value ?? true;
  pendingCloneOpenAfter.value = null;
  remoteMatches.value = [];
  void runClone(openAfter, true);
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <ScrollArea class="min-h-0 min-w-0 flex-1">
      <Form
        class="max-w-2xl min-w-0 py-1 pr-2 pl-2 pb-2"
        layout="vertical"
        @finish="void runClone(true)"
      >
        <Row :gutter="16">
          <Col :span="24">
            <FormItem :label="t('cloneRepo.urlLabel')" name="url">
              <Input
                id="clone-repo-url"
                :value="url"
                :placeholder="t('cloneRepo.urlPlaceholder')"
                autocomplete="off"
                spellcheck="false"
                :disabled="busy"
                @update:value="handleUrlChange"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem :label="t('cloneRepo.pathLabel')" name="path">
              <div class="flex gap-2">
                <Input
                  id="clone-repo-path"
                  v-model:value="path"
                  :placeholder="t('cloneRepo.pathPlaceholder')"
                  autocomplete="off"
                  spellcheck="false"
                  :disabled="busy"
                />
                <Button :disabled="busy" @click="void pickParentDirectory()">
                  <Icon name="FolderOpen" :size="16" />
                  {{ t("cloneRepo.pickButton") }}
                </Button>
              </div>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem :label="t('openRepo.aliasLabel')" name="alias">
              <Input
                id="clone-repo-alias"
                :value="alias"
                :placeholder="t('openRepo.aliasPlaceholder')"
                autocomplete="off"
                :disabled="busy"
                @update:value="
                  (next: string) => {
                    aliasEdited = true;
                    alias = next;
                  }
                "
              />
            </FormItem>
          </Col>
          <Col :xs="24" :sm="12">
            <FormItem :label="t('projectManager.projectIcon')" name="icon">
              <ProjectIconSelect
                id="clone-repo-icon"
                :value="projectIcon"
                :disabled="busy"
                @update:value="(next: string) => (projectIcon = next)"
              />
            </FormItem>
          </Col>
          <Col :xs="24" :sm="12">
            <FormItem :label="t('projectManager.workspaceLabel')" name="workspace">
              <WorkspaceSelectMenu
                :value="workspaceId"
                :select-label="t('projectManager.workspaceLabel')"
                :disabled="busy"
                @update:value="(next: string) => (workspaceId = next)"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem>
              <Button type="primary" html-type="submit" :disabled="!canSubmit" :loading="cloning">
                {{ t("cloneRepo.submitButton") }}
              </Button>
              <Button class="ml-2" :disabled="!canSubmit" @click="void runClone(false)">
                {{ t("cloneRepo.cloneAndContinue") }}
              </Button>
            </FormItem>
          </Col>
        </Row>
      </Form>
    </ScrollArea>

    <ExistingRemoteCloneDialog
      :open="pendingCloneOpenAfter !== null"
      :matches="remoteMatches"
      @update:open="
        (next: boolean) => {
          if (!next) {
            pendingCloneOpenAfter = null;
            remoteMatches = [];
          }
        }
      "
      @continue="continueClone"
    />
  </div>
</template>
