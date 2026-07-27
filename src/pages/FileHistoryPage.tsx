import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { FileHistoryWorkspace } from "@/components/git/FileHistoryWorkspace";
import { projectService } from "@/services/project";
import type { Project } from "@/types/project";
import { toUserMessage } from "@/types/error";

interface FileHistorySearch {
  projectId: string;
  filePath: string;
  ref: string | null;
}

export function parseFileHistorySearch(search: string): FileHistorySearch | null {
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId")?.trim();
  const filePath = params.get("filePath")?.trim();
  if (!projectId || !filePath) return null;
  const ref = params.get("ref")?.trim() || null;
  return { projectId, filePath, ref };
}

/** 独立子窗口：文件历史（只读）。 */
export function FileHistoryPage() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const request = parseFileHistorySearch(search);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) {
      setLoading(false);
      setError(t("fileHistory.projectNotFound"));
      return;
    }
    let active = true;
    void projectService
      .list()
      .then((projects) => {
        const next = projects.find((item) => item.id === request.projectId);
        if (!next) throw new Error(t("fileHistory.projectNotFound"));
        if (active) setProject(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(toUserMessage(reason) || t("fileHistory.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request?.projectId, t]);

  if (loading) return <StatusMessage message={t("fileHistory.loading")} />;
  if (error || !request || !project) {
    return <StatusMessage message={error || t("fileHistory.projectNotFound")} />;
  }

  return (
    <FileHistoryWorkspace project={project} filePath={request.filePath} initialRef={request.ref} />
  );
}

function StatusMessage({ message }: { message: string }) {
  return (
    <main className="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm">
      {message}
    </main>
  );
}
