import { defineStore } from "pinia";

import { store } from "@/store";

export interface FileTreeRevealRequest {
  path: string;
  /** 递增 nonce，同一路径重复定位也能触发侦听 */
  nonce: number;
}

export interface WorkspacePreviewRequest {
  path: string;
  nonce: number;
}

interface RepoNavState {
  /** 侧栏目录树定位请求 */
  fileTreeReveal: FileTreeRevealRequest | null;
  /** 工作区打开文件预览（目录树 / 工作区网格点击文件） */
  workspacePreview: WorkspacePreviewRequest | null;
}

/** 仓库页内跨面板导航（变更 → 目录树、目录树 → 工作区预览等） */
export const useRepoNavStore = defineStore("repoNav", {
  state: (): RepoNavState => ({
    fileTreeReveal: null,
    workspacePreview: null,
  }),
  actions: {
    revealInFileTree(path: string): void {
      this.fileTreeReveal = {
        path,
        nonce: (this.fileTreeReveal?.nonce ?? 0) + 1,
      };
    },
    openWorkspacePreview(path: string): void {
      this.workspacePreview = {
        path,
        nonce: (this.workspacePreview?.nonce ?? 0) + 1,
      };
    },
    clearWorkspacePreview(): void {
      this.workspacePreview = null;
    },
  },
});

/** setup 外取 store，对齐 vben `useXxxStoreWithOut` */
export function useRepoNavStoreWithOut() {
  return useRepoNavStore(store);
}
