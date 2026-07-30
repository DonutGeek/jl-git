import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { CommitFileDiffPane } from "@/components/git/CommitFileDiffPane";
import { HistoryDetailPane } from "@/components/git/HistoryDetailPane";
import { HistoryList } from "@/components/git/HistoryList";
import { HistoryWorkspaceChrome } from "@/components/git/HistoryWorkspaceChrome";
import { HistoryWorkspaceProvider } from "@/components/git/HistoryWorkspaceContext";

import { useRepoStore } from "@/store/useRepoStore";

/** ResizableSplit 水平分隔线 1px；弹层右缘让出，露出拖拽线 */
const HISTORY_SPLIT_SEPARATOR_PX = 1;

interface HistoryWorkspaceProps {
  className?: string;
  /** 子窗内为 false，隐藏「在新窗口查看历史」 */
  allowOpenInNewWindow?: boolean;
}

/**
 * 历史主区：左 HistoryList + 右 HistoryDetailPane，含提交文件对比弹层。
 * 主仓「历史」页与分支历史子弹窗共用，保证布局一致。
 */
export function HistoryWorkspace({
  className,
  allowOpenInNewWindow = true,
}: HistoryWorkspaceProps) {
  const { t } = useTranslation();
  const selectedCommitFile = useRepoStore((state) => state.selectedCommitFile);
  const showCommitFileDiff = Boolean(selectedCommitFile);
  const rootRef = useRef<HTMLDivElement>(null);
  const [commitFileDiffLeftPx, setCommitFileDiffLeftPx] = useState(0);

  // 弹层右缘：详情左缘再让出分隔条宽度，露出可拖拽线
  useLayoutEffect(() => {
    if (!showCommitFileDiff) {
      return;
    }

    function measureOverlayWidth(): void {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      const detail = root.querySelector<HTMLElement>("[data-history-detail-pane]");
      if (!detail) {
        return;
      }
      const next = Math.round(
        detail.getBoundingClientRect().left -
          root.getBoundingClientRect().left -
          HISTORY_SPLIT_SEPARATOR_PX,
      );
      if (next > 0) {
        setCommitFileDiffLeftPx((prev) => (prev === next ? prev : next));
      }
    }

    measureOverlayWidth();
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const observer = new ResizeObserver(measureOverlayWidth);
    observer.observe(root);
    const detail = root.querySelector<HTMLElement>("[data-history-detail-pane]");
    if (detail) {
      observer.observe(detail);
    }
    return () => observer.disconnect();
  }, [showCommitFileDiff]);

  return (
    <HistoryWorkspaceProvider allowOpenInNewWindow={allowOpenInNewWindow}>
      <HistoryWorkspaceChrome
        containerRef={rootRef}
        className={className}
        overlayOpen={showCommitFileDiff}
        list={<HistoryList />}
        detail={<HistoryDetailPane />}
        overlay={
          showCommitFileDiff && commitFileDiffLeftPx > 0 ? (
            <div
              className="bg-background absolute inset-y-0 left-0 z-30 overflow-hidden"
              style={{ width: commitFileDiffLeftPx }}
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
