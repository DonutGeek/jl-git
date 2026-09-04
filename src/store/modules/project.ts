import { defineStore } from "pinia";

import {
  addProject as addProjectRecord,
  createWorkspace as createWorkspaceRecord,
  getWorkspaceTree,
  listProjects,
  listRecentProjects,
  listWorkspaces,
  removeProject as removeProjectRecord,
  removeRecentProject,
  removeWorkspace as removeWorkspaceRecord,
  reorderWorkspaces,
  touchProjectOpened,
  updateProject as updateProjectRecord,
  updateWorkspace as updateWorkspaceRecord,
} from "@/api/project";
import { applyStorePatch } from "@/store/applyStorePatch";
import { store } from "@/store";
import { useAgentChatStoreWithOut } from "@/store/modules/agentChat";
import type {
  AddProjectInput,
  Project,
  ProjectAddResult,
  ProjectOrderItem,
  RecentItem,
  Workspace,
  WorkspaceOrderItem,
  WorkspaceTreeNode,
} from "@/types/project";

interface ProjectStoreState {
  projects: Project[];
  recent: RecentItem[];
  workspaces: Workspace[];
  workspaceTree: WorkspaceTreeNode[];
  current: Project | null;
}

interface ProjectStoreActions {
  loadProjects: () => Promise<Project[]>;
  loadRecent: () => Promise<RecentItem[]>;
  loadWorkspaces: () => Promise<Workspace[]>;
  createWorkspace: (
    name: string,
    parentId?: string,
    icon?: string,
    color?: string,
  ) => Promise<Workspace>;
  updateWorkspace: (input: {
    id: string;
    name?: string;
    parentId?: string | null;
    icon?: string;
    color?: string;
    locked?: boolean;
  }) => Promise<Workspace>;
  removeWorkspace: (id: string) => Promise<void>;
  updateProject: (input: {
    id: string;
    name?: string;
    workspaceId?: string | null;
    description?: string | null;
    icon?: Project["icon"];
    path?: string;
    allowRemoteMismatch?: boolean;
  }) => Promise<Project>;
  reorderGroupedItems: (input: {
    workspaces: WorkspaceOrderItem[];
    projects: ProjectOrderItem[];
  }) => Promise<void>;
  setCurrent: (project: Project | null) => void;
  addAndOpen: (
    input: Pick<AddProjectInput, "path" | "name" | "workspaceId" | "description" | "icon">,
  ) => Promise<ProjectAddResult>;
  /** 仅新增仓库记录（不标记最近打开、不设为当前），用于「保存并继续」 */
  addProject: (
    input: Pick<AddProjectInput, "path" | "name" | "workspaceId" | "description" | "icon">,
  ) => Promise<ProjectAddResult>;
  openExisting: (id: string) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
  removeRecent: (id: string) => Promise<void>;
  updateAlias: (id: string, name: string) => Promise<Project>;
  findById: (id: string) => Project | undefined;
}

type ProjectStore = ProjectStoreState & ProjectStoreActions;

function upsertProject(projects: Project[], project: Project): Project[] {
  const exists = projects.some((item) => item.id === project.id);

  if (!exists) {
    return [project, ...projects];
  }

  return projects.map((item) => (item.id === project.id ? project : item));
}

/** 最近表只存 ID；展示字段一律从仓库列表按 ID 查出 */
function projectsByRecentIds(projects: Project[], recent: RecentItem[]): Project[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return recent.flatMap((item) => {
    const project = projectById.get(item.projectId);
    if (!project) {
      return [];
    }
    return [{ ...project, lastOpenedAt: item.openedAt || project.lastOpenedAt }];
  });
}

type ProjectSet = (
  partial:
    | Partial<ProjectStoreState>
    | ((state: ProjectStore) => Partial<ProjectStoreState> | ProjectStore),
) => void;

function projectSet(partial: Parameters<ProjectSet>[0]): void {
  applyStorePatch(useProjectStoreWithOut(), partial);
}

function projectGet(): ProjectStore {
  return useProjectStoreWithOut();
}

export const useProjectStore = defineStore("project", {
  state: (): ProjectStoreState => ({
    projects: [],
    recent: [],
    workspaces: [],
    workspaceTree: [],
    current: null,
  }),
  getters: {
    recentProjects(state): Project[] {
      return projectsByRecentIds(state.projects, state.recent);
    },
  },
  actions: createProjectActions(projectSet, projectGet),
});

export function useProjectStoreWithOut() {
  return useProjectStore(store);
}

function createProjectActions(set: ProjectSet, get: () => ProjectStore): ProjectStoreActions {
  async function refreshWorkspaces(): Promise<Workspace[]> {
    const [workspaces, workspaceTree] = await Promise.all([listWorkspaces(), getWorkspaceTree()]);
    set({ workspaces, workspaceTree });
    return workspaces;
  }

  return {
    async loadProjects() {
      const projects = await listProjects();
      set({ projects });
      return projects;
    },

    async loadRecent() {
      const recent = await listRecentProjects();
      set({ recent });
      return recent;
    },

    async loadWorkspaces() {
      return refreshWorkspaces();
    },
    async createWorkspace(name, parentId, icon, color) {
      const workspace = await createWorkspaceRecord(name, parentId, icon, color);
      await refreshWorkspaces();
      return workspace;
    },
    async updateWorkspace(input) {
      const workspace = await updateWorkspaceRecord(input);
      await refreshWorkspaces();
      return workspace;
    },
    async removeWorkspace(id) {
      await removeWorkspaceRecord(id);
      const [workspaces, workspaceTree, projects] = await Promise.all([
        listWorkspaces(),
        getWorkspaceTree(),
        listProjects(),
      ]);
      set({ workspaces, workspaceTree, projects });
    },
    async updateProject(input) {
      const project = await updateProjectRecord(input);
      set((state) => ({
        projects: upsertProject(state.projects, project),
        current: state.current?.id === project.id ? project : state.current,
      }));
      return project;
    },
    async reorderGroupedItems(input) {
      await reorderWorkspaces(input);
      const [workspaces, workspaceTree, projects] = await Promise.all([
        listWorkspaces(),
        getWorkspaceTree(),
        listProjects(),
      ]);
      set({ workspaces, workspaceTree, projects });
    },

    setCurrent(project) {
      set({ current: project });
    },

    async addAndOpen(input) {
      const result = await addProjectRecord(input);
      if (result.alreadyExists) {
        set((state) => ({
          projects: upsertProject(state.projects, result.project),
        }));
        return result;
      }

      await touchProjectOpened(result.project.id);
      const recent = await listRecentProjects();

      set((state) => ({
        projects: upsertProject(state.projects, result.project),
        recent,
        current: result.project,
      }));

      return result;
    },

    async addProject(input) {
      const result = await addProjectRecord(input);

      set((state) => ({
        projects: upsertProject(state.projects, result.project),
      }));

      return result;
    },

    async openExisting(id) {
      const project = get().findById(id);

      if (!project) {
        throw new Error("项目不存在");
      }

      await touchProjectOpened(id);
      const recent = await listRecentProjects();

      set({
        recent,
        current: project,
      });

      return project;
    },

    async removeRecent(id) {
      await removeRecentProject(id);
      const recent = await listRecentProjects();
      set({ recent });
    },

    async removeProject(id) {
      await removeProjectRecord(id);
      // SQLite 侧 chat_conversations ON DELETE CASCADE；同步清鲸灵内存
      useAgentChatStoreWithOut().clearProject(id);
      const recent = await listRecentProjects();

      set((state) => ({
        projects: state.projects.filter((project) => project.id !== id),
        recent,
        current: state.current?.id === id ? null : state.current,
      }));
    },

    async updateAlias(id, name) {
      const project = await updateProjectRecord({ id, name });

      set((state) => ({
        projects: upsertProject(state.projects, project),
        current: state.current?.id === id ? project : state.current,
      }));

      return project;
    },

    findById(id) {
      return get().projects.find((project) => project.id === id);
    },
  };
}
