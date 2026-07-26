import { create } from "zustand";

export interface FileTreeRevealRequest {
  path: string;
  nonce: number;
}

export interface WorkspacePreviewRequest {
  path: string;
  nonce: number;
}

interface RepoNavState {
  /** 侧栏目录树定位请求；nonce 递增以重复定位同一路径 */
  fileTreeReveal: FileTreeRevealRequest | null;
  revealInFileTree: (path: string) => void;
  /** 工作区打开文件预览（目录树 / 工作区网格点击文件） */
  workspacePreview: WorkspacePreviewRequest | null;
  openWorkspacePreview: (path: string) => void;
  clearWorkspacePreview: () => void;
}

/** 仓库页内跨面板导航（变更 → 目录树、目录树 → 工作区预览等） */
export const useRepoNavStore = create<RepoNavState>((set) => ({
  fileTreeReveal: null,
  revealInFileTree: (path) =>
    set((state) => ({
      fileTreeReveal: {
        path,
        nonce: (state.fileTreeReveal?.nonce ?? 0) + 1,
      },
    })),
  workspacePreview: null,
  openWorkspacePreview: (path) =>
    set((state) => ({
      workspacePreview: {
        path,
        nonce: (state.workspacePreview?.nonce ?? 0) + 1,
      },
    })),
  clearWorkspacePreview: () => set({ workspacePreview: null }),
}));