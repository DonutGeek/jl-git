import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BranchCompareWorkspace } from "@/components/git/BranchCompareWorkspace";
import { listBranches } from "@/services/git";
import { projectService } from "@/services/project";
import type { BranchCompareMode, GitBranch } from "@/types/git";
import type { Project } from "@/types/project";
import { toUserMessage } from "@/types/error";

interface BranchCompareSearch {
  projectId: string;
  mode: BranchCompareMode;
  base: string;
  target: string;
}

/** 解析窗口 URL；缺少项目 ID 时由页面显示明确错误。 */
export function parseBranchCompareSearch(search: string): BranchCompareSearch | null {
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId")?.trim();
  if (!projectId) return null;
  const mode = params.get("mode") === "localUpstream" ? "localUpstream" : "branch";
  return {
    projectId,
    mode,
    base: params.get("base") ?? "",
    target: params.get("target") ?? "",
  };
}

/** 独立子窗口入口：只加载项目、分支与只读比较工作区。 */
export function BranchComparePage() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const request = parseBranchCompareSearch(search);
  const [project, setProject] = useState<Project | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) {
      setLoading(false);
      setError(t("branchCompare.projectNotFound"));
      return;
    }
    let active = true;
    void Promise.resolve()
      .then(async () => {
        const projects = await projectService.list();
        const nextProject = projects.find((item) => item.id === request.projectId);
        if (!nextProject) throw new Error(t("branchCompare.projectNotFound"));
        const nextBranches = await listBranches(nextProject.path, true);
        if (active) {
          setProject(nextProject);
          setBranches(nextBranches);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(toUserMessage(reason) || t("branchCompare.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request?.projectId, t]);

  if (loading) return <StatusMessage message={t("branchCompare.loading")} />;
  if (error || !request || !project) return <StatusMessage message={error || t("branchCompare.projectNotFound")} />;

  return (
    <BranchCompareWorkspace
      project={project}
      branches={branches}
      initialMode={request.mode}
      initialBase={request.base}
      initialTarget={request.target}
    />
  );
}

function StatusMessage({ message }: { message: string }) {
  return <main className="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm">{message}</main>;
}
