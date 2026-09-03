import type { OpenTab } from "@/store/modules/multipleTab";
import type { Project } from "@/types/project";
import type { RepoTabWorkspaceId } from "@/utils/repoTabGroups";

export interface TabDisplayItem {
  id: string;
  label: string;
  title: string;
  type: OpenTab["type"];
  workspaceId: RepoTabWorkspaceId;
  project?: Project;
}

export interface RepoTabMenuLabels {
  close: string;
  remove: string;
  closeMore: string;
  closeOthers: string;
  closeLeft: string;
  closeRight: string;
  setAlias: string;
  copy: string;
  copyRemote: string;
  copyPath: string;
}
