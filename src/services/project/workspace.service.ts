import { invokeCommand } from "@/services/invoke";
import { OkResult } from "@/types/git";
import { Workspace, WorkspaceListResult, WorkspaceResult } from "@/types/project";

async function list(): Promise<Workspace[]> { return (await invokeCommand<WorkspaceListResult>("workspace_list")).workspaces; }
async function create(name: string): Promise<Workspace> { return (await invokeCommand<WorkspaceResult>("workspace_create", { name })).workspace; }
async function remove(id: string): Promise<void> { await invokeCommand<OkResult>("workspace_delete", { id }); }

export const workspaceService = { list, create, remove };
