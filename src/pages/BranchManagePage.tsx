import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BranchManageWorkspace } from "@/components/git/BranchManageWorkspace";
import { projectService } from "@/services/project";
import { useProjectStore } from "@/store/useProjectStore";
import type { Project } from "@/types/project";
import { toUserMessage } from "@/types/error";

interface BranchManageSearch {
  projectId: string;
}

export function parseBranchManageSearch(search: string): BranchManageSearch | null {
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId")?.trim();
  if (!projectId) return null;
  return { projectId };
}

/** 独立子窗口：分支管理（只读列表）。 */
export function BranchManagePage() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const request = parseBranchManageSearch(search);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) {
      setLoading(false);
      setError(t("branchManage.projectNotFound"));
      return;
    }
    let active = true;
    void projectService
      .list()
      .then((projects) => {
        const next = projects.find((item) => item.id === request.projectId);
        if (!next) throw new Error(t("branchManage.projectNotFound"));
        if (!active) return;
        useProjectStore.setState({ projects, current: next });
        setProject(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(toUserMessage(reason) || t("branchManage.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request?.projectId, t]);

  if (loading) return <StatusMessage message={t("branchManage.loading")} />;
  if (error || !request || !project) {
    return <StatusMessage message={error || t("branchManage.projectNotFound")} />;
  }

  return <BranchManageWorkspace project={project} />;
}

function StatusMessage({ message }: { message: string }) {
  return (
    <main className="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm">
      {message}
    </main>
  );
}
