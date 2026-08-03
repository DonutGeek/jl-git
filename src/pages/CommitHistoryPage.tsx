import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AppLoadingScreen } from "@/components/common/AppLoadingScreen";
import { BranchHistoryWorkspace } from "@/components/git/BranchHistoryWorkspace";
import { projectService } from "@/services/project";
import { useProjectStore } from "@/store/useProjectStore";
import { toUserMessage } from "@/types/error";
import type { Project } from "@/types/project";

interface CommitHistorySearch {
  projectId: string;
  commitId: string;
}

export function parseCommitHistorySearch(search: string): CommitHistorySearch | null {
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId")?.trim();
  const commitId = params.get("commitId")?.trim();
  return projectId && commitId ? { projectId, commitId } : null;
}

/** 独立子窗口：定位到单次提交，并展示其完整详情与全部变更文件。 */
export function CommitHistoryPage() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const request = parseCommitHistorySearch(search);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) {
      setLoading(false);
      setError(t("commitHistory.projectNotFound"));
      return;
    }
    let active = true;
    void projectService
      .list()
      .then((projects) => {
        const next = projects.find((item) => item.id === request.projectId);
        if (!next) throw new Error(t("commitHistory.projectNotFound"));
        if (!active) return;
        useProjectStore.setState({ projects, current: next });
        setProject(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(toUserMessage(reason) || t("commitHistory.loadFailed"));
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
    return <StatusMessage message={error || t("commitHistory.projectNotFound")} />;
  }

  return (
    <BranchHistoryWorkspace
      project={project}
      initialRef={request.commitId}
      initialCommitId={request.commitId}
      windowTitle={t("commitHistory.windowTitle", { shortId: request.commitId.slice(0, 7) })}
    />
  );
}

function StatusMessage({ message }: { message: string }) {
  return (
    <main className="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm">
      {message}
    </main>
  );
}
