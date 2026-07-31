import { useTranslation } from "react-i18next";

import { CommitFileDiffPane } from "@/components/git/CommitFileDiffPane";
import { HistoryDetailPane } from "@/components/git/HistoryDetailPane";
import { HistoryList } from "@/components/git/HistoryList";
import { HistoryWorkspaceChrome } from "@/components/git/HistoryWorkspaceChrome";
import { HistoryWorkspaceProvider } from "@/components/git/HistoryWorkspaceContext";

import { useRepoStore } from "@/store/useRepoStore";

interface HistoryWorkspaceProps {
  className?: string;
  /** 子窗内为 false，隐藏「在新窗口查看历史」 */
  allowOpenInNewWindow?: boolean;
  /**
   * 提交文件对比覆盖范围：
   * - `list`：仅历史列表窗格（分支历史子弹窗）
   * - `workspace`：由主仓 RepoWorkspaceLayout 的 coverOverlay 盖住侧栏+列表（本组件不挂弹层）
   */
  fileDiffCover?: "list" | "workspace";
}

/**
 * 历史主区：左 HistoryList + 右 HistoryDetailPane，含提交文件对比弹层。
 * 主仓「历史」页与分支历史子弹窗共用，保证布局一致。
 */
export function HistoryWorkspace({
  className,
  allowOpenInNewWindow = true,
  fileDiffCover = "list",
}: HistoryWorkspaceProps) {
  const { t } = useTranslation();
  const selectedCommitFile = useRepoStore((state) => state.selectedCommitFile);
  const showCommitFileDiff = Boolean(selectedCommitFile);
  const useLocalOverlay = fileDiffCover === "list" && showCommitFileDiff;

  return (
    <HistoryWorkspaceProvider allowOpenInNewWindow={allowOpenInNewWindow}>
      <HistoryWorkspaceChrome
        className={className}
        overlayOpen={showCommitFileDiff}
        list={<HistoryList />}
        detail={<HistoryDetailPane />}
        overlay={
          useLocalOverlay ? (
            <div
              className="bg-background pointer-events-auto absolute inset-0 z-30 overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label={t("repo.commitFileDiffDialog")}
            >
              <CommitFileDiffPane />
            </div>
          ) : null
        }
      />
    </HistoryWorkspaceProvider>
  );
}
