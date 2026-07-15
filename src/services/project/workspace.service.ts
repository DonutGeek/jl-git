import { invokeCommand } from "@/services/invoke";
import { OkResult } from "@/types/git";
import { ProjectOrderItem, Workspace, WorkspaceColor, WorkspaceIcon, WorkspaceListResult, WorkspaceOrderItem, WorkspaceResult } from "@/types/project";

async function list(): Promise<Workspace[]> { return (await invokeCommand<WorkspaceListResult>("workspace_list")).workspaces; }
async function create(name: string, parentId?: string, icon?: WorkspaceIcon, color?: WorkspaceColor): Promise<Workspace> { return (await invokeCommand<WorkspaceResult>("workspace_create", { name, parentId, icon, color })).workspace; }
async function update(input: {
  id: string;
  name?: string;
  parentId?: string | null;
  icon?: WorkspaceIcon;
  color?: WorkspaceColor;
}): Promise<Workspace> {
  return (await invokeCommand<WorkspaceResult>("workspace_update", {
    id: input.id,
    name: input.name,
    parentId: input.parentId === undefined ? undefined : input.parentId,
    icon: input.icon,
    color: input.color,
  })).workspace;
}
async function remove(id: string): Promise<void> { await invokeCommand<OkResult>("workspace_delete", { id }); }
async function reorder(input: { workspaces: WorkspaceOrderItem[]; projects: ProjectOrderItem[] }): Promise<void> { await invokeCommand<OkResult>("workspace_reorder", input); }

export const workspaceService = { list, create, update, remove, reorder };
