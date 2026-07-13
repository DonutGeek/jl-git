import { create } from "zustand";

import { projectService } from "@/services/project";

import { toUserMessage } from "@/types/error";
import { AddProjectInput, Project, RecentItem } from "@/types/project";

interface ProjectStoreState {
  projects: Project[];
  recent: RecentItem[];
  current: Project | null;
  loading: boolean;
  error: string | null;
}

interface ProjectStoreActions {
  loadProjects: () => Promise<Project[]>;
  loadRecent: () => Promise<RecentItem[]>;
  setCurrent: (project: Project | null) => void;
  addAndOpen: (input: Pick<AddProjectInput, "path" | "name">) => Promise<Project>;
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
