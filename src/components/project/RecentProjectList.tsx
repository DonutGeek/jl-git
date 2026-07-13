import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderGit2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useProjectStore } from "@/store/useProjectStore";

import { toUserMessage } from "@/types/error";
import { Project, RecentItem } from "@/types/project";

interface RecentProjectRow {
  id: string;
  name: string;
  path: string;
  lastOpenedAt: string | null;
}

function mergeRecentProjects(recent: RecentItem[], projects: Project[]): RecentProjectRow[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return recent.flatMap((item) => {
    const project = projectById.get(item.projectId);
    if (!project) {
      return [];
    }

    return [
      {
        id: project.id,
        name: project.name,
        path: project.path,
        lastOpenedAt: item.openedAt || project.lastOpenedAt,
      },
    ];
  });
}

function formatOpenedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

interface RecentProjectListProps {
  onOpened?: (projectId: string) => void;
}

/** 最近项目列表：主工作台内容，点击直接进入仓库 */
export function RecentProjectList({ onOpened }: RecentProjectListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useProjectStore((state) => state.projects);
  const recent = useProjectStore((state) => state.recent);
  const loading = useProjectStore((state) => state.loading);
  const openExisting = useProjectStore((state) => state.openExisting);

  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => mergeRecentProjects(recent, projects), [projects, recent]);

  async function handleOpenProject(id: string): Promise<void> {
    setOpeningId(id);
    setError(null);

    try {
      const project = await openExisting(id);
      onOpened?.(project.id);
      navigate(`/repo/${project.id}`);
    } catch (openError) {
      setError(toUserMessage(openError));
    } finally {
      setOpeningId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
          <FolderGit2 className="text-muted-foreground size-7" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-lg font-semibold">{t("dashboard.recentEmptyTitle")}</h2>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">
          {loading ? t("common.loading") : t("dashboard.recentEmptyDescription")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-end justify-between gap-4 px-1 pb-3">
        <div>
          <h2 className="text-sm font-semibold">{t("dashboard.recentTitle")}</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">{t("dashboard.recentDescription")}</p>
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("dashboard.recentCount", { count: rows.length })}
        </span>
      </div>

      {error ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="min-h-0 flex-1 space-y-1 overflow-auto pb-4">
        {rows.map((project) => {
          const openedAt = formatOpenedAt(project.lastOpenedAt);
          const isOpening = openingId === project.id;

          return (
            <li key={project.id}>
              <button
                type="button"
                className="hover:bg-accent focus-visible:ring-ring flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                onClick={() => void handleOpenProject(project.id)}
                disabled={Boolean(openingId)}
              >
                <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <FolderGit2 className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{project.name}</span>
                  <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                    {project.path}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {isOpening ? t("common.loading") : (openedAt ?? t("dashboard.recentOpenedUnknown"))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
