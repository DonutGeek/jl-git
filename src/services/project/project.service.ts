import { invokeCommand } from "@/services/invoke";
import {
  AddProjectInput,
  PickDirectoryResult,
  Project,
  ProjectListResult,
  ProjectResult,
  RecentItem,
  RecentListResult,
} from "@/types/project";
import { OkResult } from "@/types/git";

export async function list(workspaceId?: string): Promise<Project[]> {
  const result = await invokeCommand<ProjectListResult>("project_list", {
    workspaceId,
  });

  return result.projects;
}

export async function add(input: AddProjectInput): Promise<Project> {
  const result = await invokeCommand<ProjectResult>("project_add", {
    path: input.path,
    name: input.name,
    workspaceId: input.workspaceId,
  });

  return result.project;
}

export async function touchOpened(id: string): Promise<void> {
  await invokeCommand<OkResult>("project_touch_opened", { id });
}

export async function remove(id: string): Promise<void> {
  await invokeCommand<OkResult>("project_remove", { id });
}

export async function update(input: {
  id: string;
  name?: string;
  workspaceId?: string | null;
}): Promise<Project> {
  const result = await invokeCommand<ProjectResult>("project_update", {
    id: input.id,
    name: input.name,
    workspaceId: input.workspaceId,
  });

  return result.project;
}

export async function pickDirectory(): Promise<string | null> {
  const result = await invokeCommand<PickDirectoryResult>("project_pick_directory");

  return result.path;
}

export async function listRecent(limit?: number): Promise<RecentItem[]> {
  const result = await invokeCommand<RecentListResult>("recent_list", { limit });

  return result.items;
}

export const projectService = {
  list,
  add,
  remove,
  update,
  touchOpened,
  pickDirectory,
  listRecent,
};
