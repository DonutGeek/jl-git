import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AppLoadingScreen } from "@/components/common/AppLoadingScreen";
import { HistoryWorkspace } from "@/components/git/HistoryWorkspace";
import { AppWindowHeader } from "@/components/layout/AppWindowHeader";

import { beginRepoSwitch, useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";

interface BranchHistoryWorkspaceProps {
  project: Project;
  initialRef: string | null;
}

/**
 * 分支历史子弹窗：灌入 repo store 后复用主界面 HistoryWorkspace，保证 UI 一致。
 * （每个 Tauri Webview 有独立 JS 运行时，不会与主窗 store 互相踩。）
 */
export function BranchHistoryWorkspace({ project, initialRef }: BranchHistoryWorkspaceProps) {
  const { t } = useTranslation();
  const loadAll = useRepoStore((state) => state.loadAll);
  const selectLogRef = useRepoStore((state) => state.selectLogRef);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = initialRef
    ? t("branchHistory.windowTitle", { ref: initialRef })
    : t("branchHistory.windowTitleAll");

  useEffect(() => {
    let active = true;
    setReady(false);
    setError(null);
    beginRepoSwitch(project.path);

    void (async () => {
      try {
        await loadAll(project.path);
        if (!active) return;
        // 与入口范围对齐（null = 所有分支）
        if (useRepoStore.getState().logRef !== initialRef) {
          await selectLogRef(initialRef);
        }
        if (active) setReady(true);
      } catch (reason: unknown) {
        if (active) {
          setError(toUserMessage(reason) || t("branchHistory.loadFailed"));
          setReady(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [initialRef, loadAll, project.path, selectLogRef, t]);

  if (!ready && !error) {
    return <AppLoadingScreen />;
  }

  return (
    <main className="bg-background text-foreground flex h-screen min-h-0 w-full flex-col overflow-hidden">
      <AppWindowHeader>
        <span className="truncate text-sm font-semibold" title={title}>
          {title}
        </span>
      </AppWindowHeader>

      {error ? (
        <p className="text-destructive flex flex-1 items-center justify-center px-4 text-center text-sm">
          {error}
        </p>
      ) : null}
      {ready ? <HistoryWorkspace allowOpenInNewWindow={false} /> : null}
    </main>
  );
}
