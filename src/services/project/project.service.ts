import { invokeCommand } from "@/services/invoke";
import type {
  AddProjectInput,
  PickDirectoryResult,
  Project,
  ProjectAddResult,
  ProjectListResult,
  ProjectResult,
  ProjectUniquenessResult,
  RecentItem,
  RecentListResult,
} from "@/types/project";
import type { OkResult } from "@/types/git";

export async function list(workspaceId?: string): Promise<Project[]> {
  const result = await invokeCommand<ProjectListResult>("project_list", {
    workspaceId,
  });

  return result.projects;
}

export async function add(input: AddProjectInput): Promise<ProjectAddResult> {
  return invokeCommand<ProjectAddResult>("project_add", {
    path: input.path,
    name: input.name,
    workspaceId: input.workspaceId,
    description: input.description,
    icon: input.icon,
  });
}

export async function checkUniqueness(input: {
  path?: string;
  remoteUrl?: string;
}): Promise<ProjectUniquenessResult> {
  return invokeCommand<ProjectUniquenessResult>("project_check_uniqueness", {
    path: input.path,
    remoteUrl: input.remoteUrl,
  });
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
  /** 传 `null` 清空简介；`undefined` 表示不改 */
  description?: string | null;
  icon?: Project["icon"];
  /** 改绑本地路径；须为 Git 顶层；与旧路径主远端不一致时需 `allowRemoteMismatch` */
  path?: string;
  allowRemoteMismatch?: boolean;
}): Promise<Project> {
  const result = await invokeCommand<ProjectResult>("project_update", {
    id: input.id,
    name: input.name,
    workspaceId: input.workspaceId,
    description: input.description,
    icon: input.icon,
    path: input.path,
    allowRemoteMismatch: input.allowRemoteMismatch,
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
  checkUniqueness,
  remove,
  update,
  touchOpened,
  pickDirectory,
  listRecent,
};
