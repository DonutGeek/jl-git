import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AppLoadingScreen } from "@/components/common/AppLoadingScreen";
import { BranchHistoryWorkspace } from "@/components/git/BranchHistoryWorkspace";
import { projectService } from "@/services/project";
import { useProjectStore } from "@/store/useProjectStore";
import type { Project } from "@/types/project";
import { toUserMessage } from "@/types/error";

interface BranchHistorySearch {
  projectId: string;
  ref: string | null;
}

export function parseBranchHistorySearch(search: string): BranchHistorySearch | null {
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId")?.trim();
  if (!projectId) return null;
  const ref = params.get("ref")?.trim() || null;
  return { projectId, ref };
}

/** 独立子窗口：分支历史（只读）。 */
export function BranchHistoryPage() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const request = parseBranchHistorySearch(search);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) {
      setLoading(false);
      setError(t("branchHistory.projectNotFound"));
      return;
    }
    let active = true;
    void projectService
      .list()
      .then((projects) => {
        const next = projects.find((item) => item.id === request.projectId);
        if (!next) throw new Error(t("branchHistory.projectNotFound"));
        if (!active) return;
        // 子窗有独立 JS 运行时；灌入 store，供差异工具栏「历史」等查找 projectId
        useProjectStore.setState({ projects, current: next });
        setProject(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(toUserMessage(reason) || t("branchHistory.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request?.projectId, t]);

  if (loading) return <AppLoadingScreen />;
  if (error || !request || !project) {
    return <StatusMessage message={error || t("branchHistory.projectNotFound")} />;
  }

  return <BranchHistoryWorkspace project={project} initialRef={request.ref} />;
}

function StatusMessage({ message }: { message: string }) {
  return (
    <main className="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm">
      {message}
    </main>
  );
}
