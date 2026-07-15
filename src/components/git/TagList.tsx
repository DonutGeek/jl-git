import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CreateTagDialog } from "@/components/git/CreateTagDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";

interface TagListProps { onSelectTag: () => void; }

export function TagList({ onSelectTag }: TagListProps) {
  const { t } = useTranslation();
  const tags = useRepoStore((state) => state.tags);
  const loading = useRepoStore((state) => state.loading);
  const logRef = useRepoStore((state) => state.logRef);
  const refreshTags = useRepoStore((state) => state.refreshTags);
  const selectLogRef = useRepoStore((state) => state.selectLogRef);
  const deleteTag = useRepoStore((state) => state.deleteTag);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const filtered = useMemo(() => tags.filter((tag) => tag.name.toLowerCase().includes(filter.trim().toLowerCase())), [filter, tags]);

  async function select(name: string): Promise<void> { try { await selectLogRef(name); onSelectTag(); } catch (error) { toast.error(toUserMessage(error)); } }
  async function refresh(): Promise<void> { try { await refreshTags(); } catch (error) { toast.error(toUserMessage(error)); } }
  async function remove(name: string): Promise<void> { if (!window.confirm(t("repo.deleteTagQuestion", { name }))) return; setBusyName(name); try { await deleteTag(name); toast.success(t("repo.deleteTagSuccess", { name })); } catch (error) { toast.error(toUserMessage(error)); } finally { setBusyName(null); } }

  return <div className="flex h-full min-h-0 flex-col">
    <div className="shrink-0"><div className="flex h-10 items-center gap-1 px-3"><h2 className="text-muted-foreground min-w-0 flex-1 text-xs font-semibold">{t("repo.tags")}</h2>
      <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="text-muted-foreground size-7 [&_svg]:size-3.5" aria-label={t("repo.newTag")} onClick={() => setCreating(true)}><Plus /></Button></TooltipTrigger><TooltipContent>{t("repo.newTag")}</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="text-muted-foreground size-7 [&_svg]:size-3.5" aria-label={t("repo.refresh")} disabled={loading} onClick={() => void refresh()}><RefreshCw className={cn(loading && "animate-spin")} /></Button></TooltipTrigger><TooltipContent>{t("repo.refresh")}</TooltipContent></Tooltip>
    </div><div className="px-3 pb-1"><Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t("repo.filter")} className="h-8 text-xs shadow-none" aria-label={t("repo.filter")} /></div></div>
    <ScrollArea className="min-h-0 flex-1 px-1 py-0.5">{tags.length === 0 ? <p className="text-muted-foreground px-2 py-3 text-xs">{t("repo.tagsEmpty")}</p> : filtered.length === 0 ? <p className="text-muted-foreground px-2 py-3 text-xs">{t("repo.tagsNoMatch")}</p> : <div className="flex flex-col gap-0.5">{filtered.map((tag) => <div key={tag.name} className={cn("group flex h-7 items-center gap-1 rounded-md px-1.5", logRef === tag.name ? "bg-primary/15" : "hover:bg-accent/60")}><button type="button" className="flex h-7 min-w-0 flex-1 items-center gap-1 text-left text-xs" onClick={() => void select(tag.name)}><Tag className="text-muted-foreground size-3 shrink-0" /><span className="truncate">{tag.name}</span></button><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-6 opacity-0 group-hover:opacity-100" aria-label={t("repo.deleteTag")} disabled={busyName === tag.name} onClick={() => void remove(tag.name)}><Trash2 className="size-3" /></Button></TooltipTrigger><TooltipContent>{t("repo.deleteTag")}</TooltipContent></Tooltip></div>)}</div>}</ScrollArea>
    <CreateTagDialog open={creating} onOpenChange={setCreating} />
  </div>;
}
