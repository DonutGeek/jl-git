<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { Button, Col, Form, FormItem, Input, Row, message } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import CloneRepoPanel from "./CloneRepoPanel.vue";
import ExistingProjectDialog from "./ExistingProjectDialog.vue";
import ProjectGroupsTree from "./ProjectGroupsTree.vue";
import ProjectIconSelect from "./ProjectIconSelect.vue";
import RecentProjectList from "./RecentProjectList.vue";
import WorkspaceSelectMenu from "./WorkspaceSelectMenu.vue";
import { ScrollArea } from "@/components/ScrollArea";
import { cn } from "@/lib/utils";
import { projectService } from "@/services/project";
import { openProjectManageWindow } from "@/services/window/projectManageWindow";
import { useProjectStoreWithOut } from "@/store/modules/project";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";
import { DEFAULT_PROJECT_ICON, type ProjectIcon as ProjectIconName } from "@/types/project";
import type { NewTabProjectManagerView } from "@/utils/newTabNavigation";

defineOptions({ name: "ProjectManager" });

const props = withDefaults(
  defineProps<{
    requestedView?: NewTabProjectManagerView | null;
  }>(),
  { requestedView: null },
);

const emit = defineEmits<{
  open: [projectId: string];
  requestedViewConsumed: [];
}>();

type View = "recent" | "open" | "clone" | "groups";

const { t } = useI18n();
const view = ref<View>("recent");
const path = ref("");
const alias = ref("");
const aliasEdited = ref(false);
const description = ref("");
const projectIcon = ref<ProjectIconName>(DEFAULT_PROJECT_ICON);
const workspaceId = ref("");
const opening = ref(false);
const picking = ref(false);
const existingProject = ref<Project | null>(null);

const nav = computed(() => [
  { id: "recent" as const, label: t("projectManager.recent"), icon: "History" },
  { id: "open" as const, label: t("projectManager.open"), icon: "FolderOpen" },
  { id: "clone" as const, label: t("projectManager.clone"), icon: "GitBranchPlus" },
  { id: "groups" as const, label: t("projectManager.groups"), icon: "FolderTree" },
  { id: "manage" as const, label: t("projectManager.manage"), icon: "FolderKanban" },
]);

watch(
  () => props.requestedView,
  (requested) => {
    if (requested !== "open" && requested !== "clone") {
      return;
    }
    view.value = requested;
    emit("requestedViewConsumed");
  },
  { immediate: true },
);

function getProjectName(nextPath: string): string {
  const normalizedPath = nextPath.trim().replace(/[\\/]+$/, "");
  const parts = normalizedPath.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

function handlePathChange(value: string): void {
  path.value = value;
  if (!aliasEdited.value) {
    alias.value = getProjectName(value);
  }
}

async function pickPath(): Promise<void> {
  if (picking.value || opening.value) {
    return;
  }
  const pickPromise = projectService.pickDirectory();
  picking.value = true;
  try {
    const selected = await pickPromise;
    if (selected) {
      handlePathChange(selected);
    }
  } catch (error) {
    message.error(toUserMessage(error));
  } finally {
    picking.value = false;
  }
}

function resetOpenForm(): void {
  path.value = "";
  alias.value = "";
  aliasEdited.value = false;
  description.value = "";
  projectIcon.value = DEFAULT_PROJECT_ICON;
  workspaceId.value = "";
}

async function submitOpen(): Promise<void> {
  const repositoryPath = path.value.trim();
  if (!repositoryPath || opening.value) {
    return;
  }
  opening.value = true;
  try {
    const result = await useProjectStoreWithOut().addAndOpen({
      path: repositoryPath,
      name: alias.value.trim() || undefined,
      workspaceId: workspaceId.value || undefined,
      description: description.value.trim() || undefined,
      icon: projectIcon.value,
    });
    if (result.alreadyExists) {
      existingProject.value = result.project;
      return;
    }
    resetOpenForm();
    emit("open", result.project.id);
  } catch (error) {
    message.error(toUserMessage(error));
  } finally {
    opening.value = false;
  }
}

async function saveAndContinue(): Promise<void> {
  const repositoryPath = path.value.trim();
  if (!repositoryPath || opening.value) {
    return;
  }
  opening.value = true;
  try {
    const result = await useProjectStoreWithOut().addProject({
      path: repositoryPath,
      name: alias.value.trim() || undefined,
      workspaceId: workspaceId.value || undefined,
      description: description.value.trim() || undefined,
      icon: projectIcon.value,
    });
    if (result.alreadyExists) {
      existingProject.value = result.project;
      return;
    }
    resetOpenForm();
    message.success(t("openRepo.saveAndContinueSuccess", { name: result.project.name }));
  } catch (error) {
    message.error(toUserMessage(error));
  } finally {
    opening.value = false;
  }
}

async function confirmExistingProject(project: Project): Promise<void> {
  existingProject.value = null;
  resetOpenForm();
  try {
    await useProjectStoreWithOut().openExisting(project.id);
    emit("open", project.id);
  } catch (error) {
    message.error(toUserMessage(error));
  }
}

function handleNav(id: View | "manage"): void {
  if (id === "manage") {
    void openProjectManageWindow().catch((error: unknown) => {
      message.error(toUserMessage(error) || t("projectManager.manageOpenFailed"));
    });
    return;
  }
  view.value = id;
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <aside class="flex w-48 shrink-0 flex-col gap-1 p-3">
      <Button
        v-for="item in nav"
        :key="item.id"
        type="text"
        :class="cn('justify-start gap-2', view === item.id && 'bg-accent')"
        :disabled="opening"
        @click="handleNav(item.id)"
      >
        <Icon :name="item.icon" :size="16" class="shrink-0" />
        <span class="truncate">{{ item.label }}</span>
      </Button>
    </aside>

    <section class="flex min-h-0 min-w-0 flex-1 flex-col px-6 pt-3 pb-6">
      <RecentProjectList v-if="view === 'recent'" @open="(id) => emit('open', id)" />
      <CloneRepoPanel
        v-else-if="view === 'clone'"
        :disabled="opening"
        @open="(id) => emit('open', id)"
      />
      <ProjectGroupsTree
        v-else-if="view === 'groups'"
        :disabled="opening"
        @open="(id) => emit('open', id)"
      />

      <ScrollArea v-else-if="view === 'open'" class="min-h-0 min-w-0 flex-1">
        <Form
          class="max-w-2xl min-w-0 py-1 pr-2 pl-2 pb-2"
          layout="vertical"
          @finish="void submitOpen()"
        >
          <Row :gutter="16">
            <Col :span="24">
              <FormItem :label="t('openRepo.pathLabel')" name="path">
                <div class="flex gap-2">
                  <Input
                    id="project-manager-path"
                    :value="path"
                    :placeholder="t('openRepo.pathPlaceholder')"
                    autocomplete="off"
                    :disabled="opening"
                    @update:value="handlePathChange"
                  />
                  <Button :disabled="picking || opening" @click="void pickPath()">
                    <Icon name="FolderOpen" :size="16" />
                    {{ t("openRepo.pickButton") }}
                  </Button>
                </div>
              </FormItem>
            </Col>
            <Col :span="24">
              <FormItem :label="t('openRepo.aliasLabel')" name="alias">
                <Input
                  id="project-manager-alias"
                  :value="alias"
                  :placeholder="t('openRepo.aliasPlaceholder')"
                  autocomplete="off"
                  :disabled="opening"
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
                  id="project-manager-icon"
                  :value="projectIcon"
                  :disabled="opening"
                  @update:value="(next: string) => (projectIcon = next)"
                />
              </FormItem>
            </Col>
            <Col :xs="24" :sm="12">
              <FormItem :label="t('projectManager.workspaceLabel')" name="workspace">
                <WorkspaceSelectMenu
                  :value="workspaceId"
                  :select-label="t('projectManager.workspaceLabel')"
                  :disabled="opening"
                  @update:value="(next: string) => (workspaceId = next)"
                />
              </FormItem>
            </Col>
            <Col :span="24">
              <FormItem :label="t('openRepo.detailLabel')" name="description">
                <Input.TextArea
                  id="project-manager-description"
                  v-model:value="description"
                  :rows="4"
                  :placeholder="t('openRepo.detailPlaceholder')"
                  :disabled="opening"
                />
              </FormItem>
            </Col>
            <Col :span="24">
              <FormItem>
                <Button
                  type="primary"
                  html-type="submit"
                  :disabled="!path.trim() || opening"
                  :loading="opening"
                >
                  {{ t("openRepo.submitButton") }}
                </Button>
                <Button
                  class="ml-2"
                  :disabled="!path.trim() || opening"
                  @click="void saveAndContinue()"
                >
                  {{ t("openRepo.saveAndContinue") }}
                </Button>
              </FormItem>
            </Col>
          </Row>
        </Form>
      </ScrollArea>
    </section>

    <ExistingProjectDialog
      :open="existingProject !== null"
      :project="existingProject"
      action="open"
      @update:open="(next: boolean) => !next && (existingProject = null)"
      @confirm="(project) => void confirmExistingProject(project)"
    />
  </div>
</template>
