import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderGit2, Search } from "lucide-react";

import { RemoteRepositoryLabel } from "@/components/project/RemoteRepositoryLabel";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { gitService, pickPrimaryRemoteUrl } from "@/services/git";
import { openExternalUrl } from "@/services/system/open-url";
import { useProjectStore } from "@/store/useProjectStore";

import { Project, RecentItem } from "@/types/project";
import { parseRemoteRepository } from "@/utils/remoteRepository";

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

interface RecentProjectListProps {
  onOpenProject: (projectId: string) => void;
}

/** 最近项目列表：单击选中，双击进入仓库 */
export function RecentProjectList({
  onOpenProject,
}: RecentProjectListProps) {
  const { t } = useTranslation();
  const projects = useProjectStore((state) => state.projects);
  const recent = useProjectStore((state) => state.recent);
  const loading = useProjectStore((state) => state.loading);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [remoteUrls, setRemoteUrls] = useState<Record<string, string | null>>({});

  const rows = useMemo(() => mergeRecentProjects(recent, projects), [projects, recent]);
  const filteredRows = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? rows.filter((item) => item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query)) : rows;
  }, [filter, rows]);

  function handleOpenProject(id: string): void {
    setSelectedId(id);
    onOpenProject(id);
  }

  async function showRemoteUrl(project: RecentProjectRow): Promise<void> {
    setHoveredId(project.id);
    if (project.id in remoteUrls) {
      return;
    }

    try {
      const remotes = await gitService.listRemotes(project.path);
      setRemoteUrls((current) => ({
        ...current,
        [project.id]: pickPrimaryRemoteUrl(remotes),
      }));
    } catch (error) {
      console.warn("读取仓库远程地址失败", error);
      setRemoteUrls((current) => ({ ...current, [project.id]: null }));
    }
  }

  async function openRemoteUrl(url: string): Promise<void> {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.warn("打开仓库远程地址失败", error);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
          <FolderGit2 className="text-muted-foreground size-7" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-lg font-semibold">{t("dashboard.recentEmptyTitle")}</h2>
        <p className="text-muted-foreground mt-2 flex max-w-sm items-center justify-center gap-2 text-sm">
          {loading ? (
            <>
              <Spinner className="size-3.5" />
              {t("common.loading")}
            </>
          ) : (
            t("dashboard.recentEmptyDescription")
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4 pb-4">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{t("dashboard.recentTitle")}</h2><Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">{t("dashboard.recentCount", { count: rows.length })}</Badge></div>
          <p className="text-muted-foreground mt-0.5 text-xs">{t("dashboard.recentDescription")}</p>
        </div>
        <label className="relative block w-52"><Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" aria-hidden="true" /><input value={filter} onChange={(event) => setFilter(event.target.value)} className="border-input bg-background focus-visible:ring-ring h-8 w-full rounded-md border pr-3 pl-8 text-xs outline-none focus-visible:ring-2" placeholder={t("repo.filter")} aria-label={t("repo.filter")} /></label>
      </div>

      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full pb-4 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <ul className="space-y-1" role="listbox" aria-label={t("dashboard.recentTitle")}>
            {filteredRows.map((project) => {
              const isSelected = selectedId === project.id;
              const remoteUrl = remoteUrls[project.id];
              const remote = remoteUrl
                ? parseRemoteRepository(remoteUrl)
                : null;

              return (
                <li key={project.id} role="option" aria-selected={isSelected}>
                  <button
                        type="button"
                        className={cn(
                          // 勿加 overflow-hidden，否则会裁掉右侧圆角（看起来左右不一致）
                          "focus-visible:ring-ring group relative flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
                          isSelected
                            ? "bg-accent hover:bg-accent"
                            : "hover:bg-accent/60",
                        )}
                        onClick={() => {
                          // 再次点击已选项则取消选中
                          setSelectedId((current) =>
                            current === project.id ? null : project.id,
                          );
                        }}
                        onDoubleClick={() => {
                          handleOpenProject(project.id);
                        }}
                        onMouseEnter={() => void showRemoteUrl(project)}
                        onMouseLeave={() => setHoveredId(null)}
                        onFocus={() => void showRemoteUrl(project)}
                        onBlur={() => setHoveredId(null)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && isSelected) {
                            event.preventDefault();
                            handleOpenProject(project.id);
                          }
                        }}
                      >
                    <span
                      className={cn(
                        "text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md transition-colors",
                        // 选中时略加深并加细边，避免与行底糊成一片，也不用强反差底色
                        isSelected
                          ? "bg-muted-foreground/12 ring-border/60 ring-1 ring-inset"
                          : "bg-muted group-hover:bg-muted-foreground/10 group-focus-visible:bg-muted-foreground/10",
                      )}
                    >
                      <FolderGit2 className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{project.name}</span>
                        {hoveredId === project.id && remote ? (
                          <RemoteRepositoryLabel
                            remote={remote}
                            onOpen={(url) => void openRemoteUrl(url)}
                          />
                        ) : null}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                        {project.path}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </div>
    </div>
  );
}
