import { useMemo, useState } from "react";
import { ChevronDown, Folder, FolderOpen, FolderTree, History, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { RecentProjectList } from "@/components/project/RecentProjectList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/useProjectStore";
import { projectService } from "@/services/project";

interface ProjectManagerProps {
  onOpenProject: (projectId: string) => void;
  openingProjectId?: string | null;
}
type View = "recent" | "open" | "groups";

export function ProjectManager({
  onOpenProject,
  openingProjectId = null,
}: ProjectManagerProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("recent");
  const [filter, setFilter] = useState("");
  const [path, setPath] = useState("");
  const [opening] = useState(false);
  const projects = useProjectStore((state) => state.projects);
  const workspaces = useProjectStore((state) => state.workspaces);
  const query = filter.trim().toLowerCase();
  const visibleProjects = useMemo(() => query ? projects.filter((item) => item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query)) : projects, [projects, query]);
  const nav = [{ id: "recent" as const, label: t("projectManager.recent"), icon: History }, { id: "open" as const, label: t("projectManager.open"), icon: FolderOpen }, { id: "groups" as const, label: t("projectManager.groups"), icon: FolderTree }];
  async function pickPath(): Promise<void> { const selected = await projectService.pickDirectory(); if (selected) setPath(selected); }
  const openBusy = Boolean(openingProjectId);

  return <div className="flex min-h-0 flex-1"><aside className="flex w-44 shrink-0 flex-col gap-1 p-3">{nav.map((item) => <Button key={item.id} variant="ghost" className={cn("justify-start gap-2", view === item.id && "bg-accent")} onClick={() => setView(item.id)} disabled={openBusy}><item.icon className="size-4" />{item.label}</Button>)}</aside><section className="min-w-0 flex-1 px-6 pt-3 pb-6">{view === "recent" && <RecentProjectList onOpenProject={onOpenProject} openingProjectId={openingProjectId} />}{view === "open" && <div className="max-w-2xl space-y-4"><div><label className="text-sm font-medium">{t("openRepo.pathLabel")}</label><div className="mt-2 flex gap-2"><Input value={path} onChange={(event) => setPath(event.target.value)} placeholder={t("openRepo.pathPlaceholder")} /><Button type="button" variant="outline" disabled={opening || openBusy} onClick={() => void pickPath()}><FolderOpen className="size-4" />{t("openRepo.pickButton")}</Button></div></div></div>}{view === "groups" && <div className="flex h-full max-w-4xl flex-col"><h2 className="mb-3 text-base font-semibold">{t("projectManager.groups")}</h2><label className="relative mb-3 block"><Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" /><Input value={filter} onChange={(event) => setFilter(event.target.value)} className="h-9 pl-8 text-sm" placeholder={t("repo.filter")} aria-label={t("repo.filter")} disabled={openBusy} /></label><ScrollArea className="border-border min-h-0 flex-1 rounded-md border"><div className="space-y-2 p-3"><div className="flex h-6 items-center gap-1.5 text-sm font-medium"><ChevronDown className="text-muted-foreground size-3.5" /><Folder className="text-muted-foreground size-4" />{t("projectManager.groups")}</div>{workspaces.map((workspace) => { const items = visibleProjects.filter((project) => project.workspaceId === workspace.id); return items.length ? <div key={workspace.id} className="ml-6"><div className="flex h-6 items-center gap-1.5 font-mono text-sm"><ChevronDown className="text-muted-foreground size-3.5" /><Folder className="text-muted-foreground size-4" />{workspace.name}</div>{items.map((project) => <button key={project.id} type="button" disabled={openBusy} className="hover:bg-accent ml-8 flex h-7 w-full cursor-pointer items-center gap-3 rounded px-1.5 text-left font-mono text-[13px] disabled:cursor-wait disabled:opacity-60" onDoubleClick={() => onOpenProject(project.id)}><span className="text-primary shrink-0">{project.name}</span><span className="text-muted-foreground truncate">{project.path}</span></button>)}</div> : null; })}</div></ScrollArea></div>}</section></div>;
}
