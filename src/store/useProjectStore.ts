import { create } from "zustand";

import { projectService, workspaceService } from "@/services/project";
import { useAgentChatStore } from "@/store/useAgentChatStore";
import { toUserMessage } from "@/types/error";
import { AddProjectInput, Project, ProjectOrderItem, RecentItem, Workspace, WorkspaceColor, WorkspaceIcon, WorkspaceOrderItem } from "@/types/project";

interface ProjectStoreState {
  projects: Project[];
  recent: RecentItem[];
  workspaces: Workspace[];
  current: Project | null;
  loading: boolean;
  error: string | null;
}

interface ProjectStoreActions {
  loadProjects: () => Promise<Project[]>;
  loadRecent: () => Promise<RecentItem[]>;
  loadWorkspaces: () => Promise<Workspace[]>;
  createWorkspace: (name: string, parentId?: string, icon?: WorkspaceIcon, color?: WorkspaceColor) => Promise<Workspace>;
  updateWorkspace: (input: {
    id: string;
    name?: string;
    parentId?: string | null;
    icon?: WorkspaceIcon;
    color?: WorkspaceColor;
  }) => Promise<Workspace>;
  removeWorkspace: (id: string) => Promise<void>;
  updateProject: (input: {
    id: string;
    name?: string;
    workspaceId?: string | null;
    description?: string | null;
  }) => Promise<Project>;
  reorderGroupedItems: (input: { workspaces: WorkspaceOrderItem[]; projects: ProjectOrderItem[] }) => Promise<void>;
  setCurrent: (project: Project | null) => void;
  addAndOpen: (
    input: Pick<AddProjectInput, "path" | "name" | "workspaceId" | "description">,
  ) => Promise<Project>;
  openExisting: (id: string) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
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

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  recent: [],
  workspaces: [],
  current: null,
  loading: false,
  error: null,

  async loadProjects() {
    set({ loading: true, error: null });

    try {
      const projects = await projectService.list();
      set({ projects, loading: false });
      return projects;
    } catch (error) {
      const message = toUserMessage(error);
      set({ error: message, loading: false });
      throw error;
    }
  },

  async loadRecent() {
    set({ loading: true, error: null });

    try {
      const recent = await projectService.listRecent();
      set({ recent, loading: false });
      return recent;
    } catch (error) {
      const message = toUserMessage(error);
      set({ error: message, loading: false });
      throw error;
    }
  },

  async loadWorkspaces() { const workspaces = await workspaceService.list(); set({ workspaces }); return workspaces; },
  async createWorkspace(name, parentId, icon, color) { const workspace = await workspaceService.create(name, parentId, icon, color); set((state) => ({ workspaces: [...state.workspaces, workspace] })); return workspace; },
  async updateWorkspace(input) {
    const workspace = await workspaceService.update(input);
    set((state) => ({
      workspaces: state.workspaces.map((item) => (item.id === workspace.id ? workspace : item)),
    }));
    return workspace;
  },
  async removeWorkspace(id) {
    await workspaceService.remove(id);
    set((state) => ({
      workspaces: state.workspaces
        .filter((item) => item.id !== id)
        .map((item) => (item.parentId === id ? { ...item, parentId: null } : item)),
      projects: state.projects.map((project) =>
        project.workspaceId === id ? { ...project, workspaceId: null } : project,
      ),
    }));
  },
  async updateProject(input) { const project = await projectService.update(input); set((state) => ({ projects: upsertProject(state.projects, project), current: state.current?.id === project.id ? project : state.current })); return project; },
  async reorderGroupedItems(input) {
    await workspaceService.reorder(input);
    const workspaceOrder = new Map(input.workspaces.map((item) => [item.id, item.sortOrder]));
    const projectOrder = new Map(input.projects.map((item) => [item.id, item]));
    set((state) => ({
      workspaces: state.workspaces.map((workspace) => ({ ...workspace, sortOrder: workspaceOrder.get(workspace.id) ?? workspace.sortOrder })),
      projects: state.projects.map((project) => {
        const order = projectOrder.get(project.id);
        return order ? { ...project, workspaceId: order.workspaceId, sortOrder: order.sortOrder } : project;
      }),
    }));
  },

  setCurrent(project) {
    set({ current: project });
  },

  async addAndOpen(input) {
    set({ loading: true, error: null });

    try {
      const project = await projectService.add(input);
      await projectService.touchOpened(project.id);
      const recent = await projectService.listRecent();

      set((state) => ({
        projects: upsertProject(state.projects, project),
        recent,
        current: project,
        loading: false,
      }));

      return project;
    } catch (error) {
      const message = toUserMessage(error);
      set({ error: message, loading: false });
      throw error;
    }
  },

  async openExisting(id) {
    set({ loading: true, error: null });

    try {
      const project = get().findById(id);

      if (!project) {
        throw new Error("项目不存在");
      }

      await projectService.touchOpened(id);
      const recent = await projectService.listRecent();

      set({
        recent,
        current: project,
        loading: false,
      });

      return project;
    } catch (error) {
      const message = toUserMessage(error);
      set({ error: message, loading: false });
      throw error;
    }
  },

  async removeProject(id) {
    set({ error: null });

    try {
      await projectService.remove(id);
      // SQLite 侧 chat_conversations ON DELETE CASCADE；同步清鲸灵内存
      useAgentChatStore.getState().clearProject(id);
      const recent = await projectService.listRecent();

      set((state) => ({
        projects: state.projects.filter((project) => project.id !== id),
        recent,
        current: state.current?.id === id ? null : state.current,
      }));
    } catch (error) {
      const message = toUserMessage(error);
      set({ error: message });
      throw error;
    }
  },

  async updateAlias(id, name) {
    set({ error: null });

    try {
      const project = await projectService.update({ id, name });

      set((state) => ({
        projects: upsertProject(state.projects, project),
        current: state.current?.id === id ? project : state.current,
      }));

      return project;
    } catch (error) {
      const message = toUserMessage(error);
      set({ error: message });
      throw error;
    }
  },

  findById(id) {
    return get().projects.find((project) => project.id === id);
  },
}));
