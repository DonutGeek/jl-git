import { useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trans, useTranslation } from "react-i18next";
import {
  Copy,
  GitBranch as GitBranchIcon,
  History,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { CreateBranchDialog } from "@/components/git/CreateBranchDialog";
import { CreateTagDialog } from "@/components/git/CreateTagDialog";
import { TagListFilterMenu } from "@/components/git/TagListFilterMenu";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import type { GitTag } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import { deferUi } from "@/utils/deferUi";
import {
  filterAndSortTags,
  patchTagListPrefs,
  readTagListPrefs,
  type TagListPrefs,
} from "@/utils/tagListPrefs";

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
  const checkout = useRepoStore((state) => state.checkout);

  const [filter, setFilter] = useState("");
  const [listPrefs, setListPrefs] = useState<TagListPrefs>(readTagListPrefs);
  const [creatingTag, setCreatingTag] = useState(false);
  const [createTagFrom, setCreateTagFrom] = useState<string | null>(null);
  const [createBranchFrom, setCreateBranchFrom] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterAndSortTags(tags, listPrefs, filter),
    [filter, listPrefs, tags],
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

  function handleListPrefsChange(patch: Partial<TagListPrefs>): void {
    setListPrefs((prev) => patchTagListPrefs(prev, patch));
  }

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

  function openDelete(name: string): void {
    // 等右键菜单卸载后再开确认框，避免焦点冲突
    deferUi(() => {
      setDeleteTarget(name);
      setDeleteBusy(false);
    });
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || deleteBusy) {
      return;
    }
    const name = deleteTarget;
    setDeleteBusy(true);
    setBusyName(name);
    try {
      await deleteTag(name);
      setDeleteTarget(null);
      toast.success(t("repo.deleteTagSuccess", { name }));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setDeleteBusy(false);
      setBusyName(null);
    }
  }

  async function copyName(name: string): Promise<void> {
    try {
      await copyToClipboard(name);
      toast.success(t("repo.copyTagNameSuccess"));
    } catch {
      toast.error(t("repo.copyTagNameFailed"));
    }
  }

  async function checkoutTag(name: string): Promise<void> {
    setBusyName(name);
    const toastId = toast.loading(t("repo.checkoutTagStart", { name }));
    try {
      await checkout(`tags/${name}`);
      toast.success(t("repo.checkoutTagSuccess", { name }), { id: toastId });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
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
          <TagListFilterMenu prefs={listPrefs} onChange={handleListPrefsChange} />
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-7 [&_svg]:size-3.5"
                aria-label={t("repo.newTag")}
                onClick={() => {
                  setCreateTagFrom(null);
                  setCreatingTag(true);
                }}
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
                {loading ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
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
                  <TagRow
                    tag={tag}
                    selected={logRef === tag.name}
                    busy={busyName === tag.name}
                    onSelect={() => void select(tag.name)}
                    onCheckout={() => void checkoutTag(tag.name)}
                    onCreateBranch={() =>
                      deferUi(() => setCreateBranchFrom(tag.name))
                    }
                    onCreateTag={() =>
                      deferUi(() => {
                        setCreateTagFrom(tag.name);
                        setCreatingTag(true);
                      })
                    }
                    onCopyName={() => void copyName(tag.name)}
                    onDelete={() => openDelete(tag.name)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <CreateTagDialog
        open={creatingTag}
        onOpenChange={(open) => {
          setCreatingTag(open);
          if (!open) {
            setCreateTagFrom(null);
          }
        }}
        fixedRef={createTagFrom}
        fixedRefIsTag={Boolean(createTagFrom)}
      />
      <CreateBranchDialog
        open={createBranchFrom !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateBranchFrom(null);
          }
        }}
        fixedStartPoint={createBranchFrom}
        fixedStartIsTag
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md gap-4 p-5 sm:rounded-lg">
          <DialogHeader>
            <DialogTitle>{t("repo.deleteTagTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3">
            <TriangleAlert
              className="text-chart-4 mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-foreground text-sm">
                <Trans
                  i18nKey="repo.deleteTagQuestion"
                  values={{ name: deleteTarget ?? "" }}
                  components={{
                    name: <span className="font-mono font-medium" />,
                  }}
                />
              </p>
              <p className="text-muted-foreground text-xs">
                {t("repo.deleteTagIrreversible")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteBusy}
              onClick={() => setDeleteTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? <Spinner className="size-3.5" /> : null}
              {t("repo.deleteTagAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TagRowProps {
  tag: GitTag;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onCheckout: () => void;
  onCreateBranch: () => void;
  onCreateTag: () => void;
  onCopyName: () => void;
  onDelete: () => void;
}

function TagRow({
  tag,
  selected,
  busy,
  onSelect,
  onCheckout,
  onCreateBranch,
  onCreateTag,
  onCopyName,
  onDelete,
}: TagRowProps) {
  const { t } = useTranslation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-sm",
            selected ? "bg-primary/15" : "hover:bg-accent/60",
            busy && "cursor-wait opacity-70",
          )}
          disabled={busy}
          onClick={onSelect}
        >
          <Tag
            className="text-muted-foreground size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">{tag.name}</span>
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-44">
        <ContextMenuItem disabled={busy} onSelect={onCheckout}>
          <GitBranchIcon className="size-3.5" aria-hidden="true" />
          {t("repo.checkoutTag", { name: tag.name })}
        </ContextMenuItem>
        <ContextMenuItem disabled={busy} onSelect={onCreateBranch}>
          <GitBranchIcon className="size-3.5" aria-hidden="true" />
          {t("repo.createBranchFromTag")}
        </ContextMenuItem>
        <ContextMenuItem disabled={busy} onSelect={onCreateTag}>
          <Tag className="size-3.5" aria-hidden="true" />
          {t("repo.createTagFromTag")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={busy} onSelect={onSelect}>
          <History className="size-3.5" aria-hidden="true" />
          {t("repo.viewTagHistory")}
        </ContextMenuItem>
        <ContextMenuItem disabled={busy} onSelect={onCopyName}>
          <Copy className="size-3.5" aria-hidden="true" />
          {t("repo.copyTagName")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={busy}
          className="text-destructive focus:text-destructive"
          onSelect={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          {t("repo.deleteTag")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
