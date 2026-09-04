export { configureHttpAuth, requestClient, toAppError, type HttpAuthAccessor } from "@/utils/http";
export {
  addProject,
  checkProjectUniqueness,
  createWorkspace,
  getProjectCatalogTree,
  getProjectProfileSnapshot,
  getWorkspaceTree,
  listProjects,
  listRecentProjects,
  listWorkspaces,
  pickProjectDirectory,
  removeProject,
  removeRecentProject,
  removeWorkspace,
  reorderWorkspaces,
  touchProjectOpened,
  updateProject,
  updateWorkspace,
} from "./project";
export type { ProjectProfileFile, ProjectProfileSnapshot } from "./project";
export {
  getDeepSeekBalance,
  getDeepSeekModels,
  postDeepSeekChat,
  postDeepSeekChatStream,
} from "./deepseek";
export type { DeepSeekJsonRequestOptions, DeepSeekStreamRequestOptions } from "./deepseek";
