import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CommitFileDiffPane } from "@/components/git/CommitFileDiffPane";

import { useRepoStore } from "@/store/useRepoStore";

/** 与历史分栏手柄同宽，右缘让出以便仍可拖拽 */
const HISTORY_SPLIT_SEPARATOR_PX = 1;

/**
 * 主仓历史：提交文件对比盖住「分支侧栏 + 历史列表」整片左侧，
 * 右缘对齐详情栏，不盖住详情与分栏手柄。
 */
export function CommitFileDiffWorkspaceOverlay() {
  const { t } = useTranslation();
  const selectedCommitFile = useRepoStore((state) => state.selectedCommitFile);
  const show = Boolean(selectedCommitFile);
  const [widthPx, setWidthPx] = useState(0);

  useLayoutEffect(() => {
    if (!show) {
      setWidthPx(0);
      return;
    }

    function measure(): void {
      const root = document.querySelector<HTMLElement>("[data-repo-workspace-split]");
      const detail = document.querySelector<HTMLElement>("[data-history-detail-pane]");
      if (!root || !detail) {
        return;
      }
      const next = Math.round(
        detail.getBoundingClientRect().left -
          root.getBoundingClientRect().left -
          HISTORY_SPLIT_SEPARATOR_PX,
      );
      setWidthPx((prev) => (prev === next ? prev : Math.max(0, next)));
    }

    measure();
    const root = document.querySelector<HTMLElement>("[data-repo-workspace-split]");
    const detail = document.querySelector<HTMLElement>("[data-history-detail-pane]");
    if (!root) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (detail) {
      observer.observe(detail);
    }
    return () => observer.disconnect();
  }, [show]);

  if (!show || widthPx <= 0) {
    return null;
  }

  return (
    <div
      className="bg-background absolute inset-y-0 left-0 z-30 overflow-hidden"
      style={{ width: widthPx }}
      role="dialog"
      aria-modal="true"
      aria-label={t("repo.commitFileDiffDialog")}
    >
      <CommitFileDiffPane />
    </div>
  );
}
