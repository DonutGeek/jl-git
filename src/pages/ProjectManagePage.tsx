import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderKanban } from "lucide-react";

import { AppLoadingScreen } from "@/components/common/AppLoadingScreen";
import { AppWindowHeader } from "@/components/layout/AppWindowHeader";
import { ProjectManagePanel } from "@/components/project/ProjectManagePanel";
import {
  notifyProjectsChanged,
  requestOpenProjectInMain,
} from "@/services/window/projectManageBridge";
import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";

/** 独立浮动子窗：项目管理控制台 */
export function ProjectManagePage() {
  const { t } = useTranslation();
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadRecent = useProjectStore((state) => state.loadRecent);
  const loadWorkspaces = useProjectStore((state) => state.loadWorkspaces);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([loadProjects(), loadRecent(), loadWorkspaces()])
      .then(() => {
        if (active) {
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(toUserMessage(reason) || t("projectManager.manageLoadFailed"));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [loadProjects, loadRecent, loadWorkspaces, t]);

  async function handleOpenProject(projectId: string): Promise<void> {
    try {
      await requestOpenProjectInMain(projectId);
    } catch (reason: unknown) {
      setError(toUserMessage(reason) || t("projectManager.manageOpenFailed"));
    }
  }

  async function handleProjectsMutated(): Promise<void> {
    try {
      await notifyProjectsChanged();
    } catch {
      // 主窗未开监听时忽略
    }
  }

  if (loading) {
    return <AppLoadingScreen />;
  }

  return (
    <div className="bg-background text-foreground flex h-screen flex-col overflow-hidden">
      <AppWindowHeader>
        <FolderKanban className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate text-sm font-medium">{t("projectManager.manage")}</span>
      </AppWindowHeader>

      <main className="flex min-h-0 flex-1 flex-col px-3 py-2">
        {error ? (
          <p className="text-destructive mb-2 shrink-0 text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <ProjectManagePanel
          onOpenProject={(projectId) => {
            void handleOpenProject(projectId);
          }}
          onProjectsMutated={() => {
            void handleProjectsMutated();
          }}
        />
      </main>
    </div>
  );
}
