import { useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CreateTagDialog } from "@/components/git/CreateTagDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";

/** 与过滤框 h-8 对齐，略高于分支树行，避免标签名显得挤 */
const TAG_ROW_HEIGHT_PX = 32;
const TAG_VIRTUAL_OVERSCAN = 12;

interface TagListProps {
  onSelectTag: () => void;
}

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

  const filtered = useMemo(
    () =>
      tags.filter((tag) =>
        tag.name.toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    [filter, tags],
  );

  const isEmpty = tags.length === 0;
  const noMatch = !isEmpty && filtered.length === 0;

  const { viewport, bindScrollArea } = useScrollAreaViewport();
  const virtualizer = useVirtualizer({
    count: isEmpty || noMatch ? 0 : filtered.length,
    getScrollElement: () => viewport,
    estimateSize: () => TAG_ROW_HEIGHT_PX,
    overscan: TAG_VIRTUAL_OVERSCAN,
    getItemKey: (index) => filtered[index]?.name ?? index,
  });

  async function select(name: string): Promise<void> {
    try {
      await selectLogRef(name);
      onSelectTag();
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function refresh(): Promise<void> {
    const toastId = toast.loading(t("repo.refreshStart"));
    try {
      await refreshTags();
      toast.success(t("repo.tagRefreshSuccess"), { id: toastId });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    }
  }

  async function remove(name: string): Promise<void> {
    if (!window.confirm(t("repo.deleteTagQuestion", { name }))) {
      return;
    }
    setBusyName(name);
    try {
      await deleteTag(name);
      toast.success(t("repo.deleteTagSuccess", { name }));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusyName(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <div className="flex h-10 items-center gap-1 px-3">
          <h2 className="text-muted-foreground min-w-0 flex-1 text-xs font-semibold">
            {t("repo.tags")}
          </h2>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-7 [&_svg]:size-3.5"
                aria-label={t("repo.newTag")}
                onClick={() => setCreating(true)}
              >
                <Plus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.newTag")}</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-7 [&_svg]:size-3.5"
                aria-label={t("repo.refresh")}
                disabled={loading}
                onClick={() => void refresh()}
              >
                <RefreshCw
                  className={cn(loading && "animate-spin")}
                  aria-hidden="true"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.refresh")}</TooltipContent>
          </Tooltip>
        </div>
        <div className="px-3 pb-1">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t("repo.filter")}
            className="h-8 w-full min-w-0 text-xs shadow-none"
            aria-label={t("repo.filter")}
          />
        </div>
      </div>

      <ScrollArea
        ref={bindScrollArea}
        className="min-h-0 flex-1 px-3 py-0.5 [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full"
      >
        {isEmpty ? (
          <EmptyState
            compact
            className="h-full"
            icon={<Tag />}
            title={t("repo.tagsEmpty")}
            description={t("repo.tagsEmptyDescription")}
          />
        ) : noMatch ? (
          <p className="text-muted-foreground px-2 py-3 text-xs">
            {t("repo.tagsNoMatch")}
          </p>
        ) : (
          <div
            className="relative w-full min-w-0"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const tag = filtered[virtualItem.index];
              if (!tag) {
                return null;
              }
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  className="absolute top-0 left-0 w-full min-w-0"
                  style={{
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div
                    className={cn(
                      "group flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2",
                      logRef === tag.name
                        ? "bg-primary/15"
                        : "hover:bg-accent/60",
                    )}
                  >
                    <button
                      type="button"
                      className="flex h-8 min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
                      onClick={() => void select(tag.name)}
                    >
                      <Tag
                        className="text-muted-foreground size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 truncate">{tag.name}</span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-3.5"
                      aria-label={t("repo.deleteTag")}
                      disabled={busyName === tag.name}
                      onClick={() => void remove(tag.name)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <CreateTagDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
