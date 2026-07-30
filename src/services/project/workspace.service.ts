import { invokeCommand } from "@/services/invoke";
import type { OkResult } from "@/types/git";
import type {
  ProjectOrderItem,
  Workspace,
  WorkspaceColor,
  WorkspaceIcon,
  WorkspaceListResult,
  WorkspaceOrderItem,
  WorkspaceResult,
} from "@/types/project";
import {
  DEFAULT_WORKSPACE_COLOR,
  normalizeWorkspaceColor,
  requireWorkspaceColor,
} from "@/utils/workspaceColor";

function normalizeWorkspace(workspace: Workspace): Workspace {
  return {
    ...workspace,
    color: normalizeWorkspaceColor(workspace.color),
    locked: Boolean(workspace.locked),
  };
}

async function list(): Promise<Workspace[]> {
  return (await invokeCommand<WorkspaceListResult>("workspace_list")).workspaces.map(
    normalizeWorkspace,
  );
}
async function create(
  name: string,
  parentId?: string,
  icon?: WorkspaceIcon,
  color?: WorkspaceColor,
): Promise<Workspace> {
  const result = await invokeCommand<WorkspaceResult>("workspace_create", {
    name,
    parentId,
    icon,
    color: requireWorkspaceColor(color ?? DEFAULT_WORKSPACE_COLOR),
  });
  return normalizeWorkspace(result.workspace);
}
async function update(input: {
  id: string;
  name?: string;
  parentId?: string | null;
  icon?: WorkspaceIcon;
  color?: WorkspaceColor;
  locked?: boolean;
}): Promise<Workspace> {
  const result = await invokeCommand<WorkspaceResult>("workspace_update", {
    id: input.id,
    name: input.name,
    parentId: input.parentId === undefined ? undefined : input.parentId,
    icon: input.icon,
    color: input.color === undefined ? undefined : requireWorkspaceColor(input.color),
    locked: input.locked,
  });
  return normalizeWorkspace(result.workspace);
}
async function remove(id: string): Promise<void> {
  await invokeCommand<OkResult>("workspace_delete", { id });
}
async function reorder(input: {
  workspaces: WorkspaceOrderItem[];
  projects: ProjectOrderItem[];
}): Promise<void> {
  await invokeCommand<OkResult>("workspace_reorder", input);
}

export const workspaceService = { list, create, update, remove, reorder };
