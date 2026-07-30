import { useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trans, useTranslation } from "react-i18next";
import {
  Cloud,
  CloudOff,
  Copy,
  Download,
  GitBranch as GitBranchIcon,
  History,
  Monitor,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { BranchGroup, IndentGuides } from "@/components/git/BranchTree";
import { CreateBranchDialog } from "@/components/git/CreateBranchDialog";
import { CreateTagDialog } from "@/components/git/CreateTagDialog";
import { TagListFilterMenu } from "@/components/git/TagListFilterMenu";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import type { GitRemoteTag, GitTag } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import { useContextMenuOpen } from "@/utils/contextMenuHighlight";
import { deferUi } from "@/utils/deferUi";
import {
  filterAndSortTags,
  patchTagListPrefs,
  readTagListPrefs,
  type TagListPrefs,
} from "@/utils/tagListPrefs";

/** 删除对象：本地标签（可选同时删远端）或仅远端标签 */
type TagDeleteTarget = {
  name: string;
  /** local：本地标签；remote：远端独有标签 */
  scope: "local" | "remote";
  /** 本地标签是否也存在于远端（决定是否显示「同时删远端」勾选） */
  onRemote: boolean;
};

/** 标签列表虚拟行：分组头 / 本地标签 / 远端独有标签 */
type TagVisibleRow =
  | { kind: "group"; id: "local" | "remote"; open: boolean; count: number }
  | { kind: "local"; tag: GitTag; onRemote: boolean }
  | { kind: "remote"; tag: GitRemoteTag };

/** 行高与分支树保持一致（分组头 / 标签行统一 28px），保证虚线引导连续 */
const TAG_ROW_HEIGHT_PX = 28;
const TAG_VIRTUAL_OVERSCAN = 12;

interface TagListProps {
  onSelectTag: () => void;
}

export function TagList({ onSelectTag }: TagListProps) {
  const { t } = useTranslation();
  const tags = useRepoStore((state) => state.tags);
  const remoteTags = useRepoStore((state) => state.remoteTags);
  const remoteTagsLoading = useRepoStore((state) => state.remoteTagsLoading);
  const repoPath = useRepoStore((state) => state.repoPath);
  const loading = useRepoStore((state) => state.loading);
  const logRef = useRepoStore((state) => state.logRef);
  const refreshTags = useRepoStore((state) => state.refreshTags);
  const refreshRemoteTags = useRepoStore((state) => state.refreshRemoteTags);
  const selectLogRef = useRepoStore((state) => state.selectLogRef);
  const deleteTag = useRepoStore((state) => state.deleteTag);
  const pushTag = useRepoStore((state) => state.pushTag);
  const fetchRemoteTag = useRepoStore((state) => state.fetchRemoteTag);
  const deleteRemoteTag = useRepoStore((state) => state.deleteRemoteTag);
  const deleteTagBoth = useRepoStore((state) => state.deleteTagBoth);
  const checkout = useRepoStore((state) => state.checkout);

  const [filter, setFilter] = useState("");
  const [listPrefs, setListPrefs] = useState<TagListPrefs>(readTagListPrefs);
  const [localOpen, setLocalOpen] = useState(true);
  const [remoteOpen, setRemoteOpen] = useState(true);
  const [creatingTag, setCreatingTag] = useState(false);
  const [createTagFrom, setCreateTagFrom] = useState<string | null>(null);
  const [createBranchFrom, setCreateBranchFrom] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TagDeleteTarget | null>(null);
  // 与分支删除一致：本地标签删除时可勾选是否同时删远端
  const [deleteRemoteAlso, setDeleteRemoteAlso] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);

  // 打开标签面板 / 切仓时自动联网查询远端标签
  useEffect(() => {
    setCreatingTag(false);
    setCreateTagFrom(null);
    setCreateBranchFrom(null);
    setDeleteTarget(null);
    setDeleteRemoteAlso(false);
    setDeleteBusy(false);
    setBusyName(null);
    if (repoPath) {
      void refreshRemoteTags();
    }
  }, [repoPath, refreshRemoteTags]);

  const filtered = useMemo(
    () => filterAndSortTags(tags, listPrefs, filter),
    [filter, listPrefs, tags],
  );

  const localNames = useMemo(() => new Set(tags.map((tag) => tag.name)), [tags]);
  const remoteNameSet = useMemo(
    () => new Set((remoteTags ?? []).map((tag) => tag.name)),
    [remoteTags],
  );
  /** null 表示远端未知（无远端/离线），此时不展示远端分组与未推送标记 */
  const remoteKnown = remoteTags !== null;

  // 远端独有标签（本地不存在），按名称降序，并套用过滤关键词
  const remoteOnly = useMemo(() => {
    if (!remoteTags) {
      return [];
    }
    const keyword = filter.trim().toLowerCase();
    return remoteTags
      .filter((tag) => !localNames.has(tag.name))
      .filter((tag) => !keyword || tag.name.toLowerCase().includes(keyword))
      .sort((a, b) => b.name.localeCompare(a.name));
  }, [filter, localNames, remoteTags]);

  const visibleRows = useMemo((): TagVisibleRow[] => {
    const rows: TagVisibleRow[] = [];
    rows.push({
      kind: "group",
      id: "local",
      open: localOpen,
      count: filtered.length,
    });
    if (localOpen) {
      for (const tag of filtered) {
        rows.push({
          kind: "local",
          tag,
          onRemote: remoteNameSet.has(tag.name),
        });
      }
    }
    if (remoteKnown) {
      rows.push({
        kind: "group",
        id: "remote",
        open: remoteOpen,
        count: remoteOnly.length,
      });
      if (remoteOpen) {
        for (const tag of remoteOnly) {
          rows.push({ kind: "remote", tag });
        }
      }
    }
    return rows;
  }, [filtered, localOpen, remoteKnown, remoteNameSet, remoteOnly, remoteOpen]);

  const isEmpty = tags.length === 0 && remoteOnly.length === 0;
  const noMatch = !isEmpty && filtered.length === 0 && remoteOnly.length === 0;

  const { viewport, bindScrollArea } = useScrollAreaViewport();
  const virtualizer = useVirtualizer({
    count: isEmpty || noMatch ? 0 : visibleRows.length,
    getScrollElement: () => viewport,
    estimateSize: () => TAG_ROW_HEIGHT_PX,
    overscan: TAG_VIRTUAL_OVERSCAN,
    getItemKey: (index) => {
      const row = visibleRows[index];
      if (!row) {
        return index;
      }
      if (row.kind === "group") {
        return `group:${row.id}`;
      }
      return `${row.kind}:${row.tag.name}`;
    },
  });

  function handleListPrefsChange(patch: Partial<TagListPrefs>): void {
    setListPrefs((prev) => patchTagListPrefs(prev, patch));
  }

  async function select(name: string): Promise<void> {
    const originRepoPath = repoPath;
    if (!originRepoPath) {
      return;
    }
    try {
      await selectLogRef(name);
      if (useRepoStore.getState().repoPath === originRepoPath) {
        onSelectTag();
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  }

  async function refresh(): Promise<void> {
    const toastId = toast.loading(t("repo.refreshStart"));
    try {
      // 本地必成功；远端联网失败不应影响提示
      await Promise.all([refreshTags(), refreshRemoteTags()]);
      toast.success(t("repo.tagRefreshSuccess"), { id: toastId });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    }
  }

  function openDelete(target: TagDeleteTarget): void {
    // 等右键菜单卸载后再开确认框，避免焦点冲突
    deferUi(() => {
      setDeleteTarget(target);
      setDeleteRemoteAlso(false);
      setDeleteBusy(false);
    });
  }

  // 本地标签存在于远端时，才展示「同时从远端删除」勾选
  const deleteHasRemote = deleteTarget?.scope === "local" && deleteTarget.onRemote;

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || deleteBusy) {
      return;
    }
    const { name, scope } = deleteTarget;
    const alsoRemote = deleteHasRemote && deleteRemoteAlso;
    const originRepoPath = repoPath;
    if (!originRepoPath) {
      return;
    }
    setDeleteBusy(true);
    setBusyName(name);
    try {
      let successKey = "repo.deleteTagSuccess";
      if (scope === "remote") {
        await deleteRemoteTag(name);
        successKey = "repo.deleteTagRemoteSuccess";
      } else if (alsoRemote) {
        await deleteTagBoth(name);
        successKey = "repo.deleteTagBothSuccess";
      } else {
        await deleteTag(name);
      }
      const stillOnOrigin = useRepoStore.getState().repoPath === originRepoPath;
      if (stillOnOrigin) {
        setDeleteTarget(null);
      }
      // 涉及远端的删除会改变同步状态，刷新远端集合
      if (stillOnOrigin && (scope === "remote" || alsoRemote)) {
        void refreshRemoteTags();
      }
      toast.success(t(successKey, { name }));
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setDeleteBusy(false);
        setBusyName(null);
      }
    }
  }

  async function pushTagToRemote(name: string): Promise<void> {
    const originRepoPath = repoPath;
    if (!originRepoPath) {
      return;
    }
    setBusyName(name);
    const toastId = toast.loading(t("repo.pushTagStart", { name }));
    try {
      await pushTag(name);
      if (useRepoStore.getState().repoPath === originRepoPath) {
        void refreshRemoteTags();
      }
      toast.success(t("repo.pushTagSuccess", { name }), { id: toastId });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    } finally {
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setBusyName(null);
      }
    }
  }

  async function fetchTagToLocal(name: string): Promise<void> {
    const originRepoPath = repoPath;
    if (!originRepoPath) {
      return;
    }
    setBusyName(name);
    const toastId = toast.loading(t("repo.fetchTagStart", { name }));
    try {
      await fetchRemoteTag(name);
      if (useRepoStore.getState().repoPath === originRepoPath) {
        void refreshRemoteTags();
      }
      toast.success(t("repo.fetchTagSuccess", { name }), { id: toastId });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    } finally {
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setBusyName(null);
      }
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
    const originRepoPath = repoPath;
    if (!originRepoPath) {
      return;
    }
    setBusyName(name);
    const toastId = toast.loading(t("repo.checkoutTagStart", { name }));
    try {
      await checkout(`tags/${name}`);
      toast.success(t("repo.checkoutTagSuccess", { name }), { id: toastId });
    } catch (error) {
      toast.error(toUserMessage(error), { id: toastId });
    } finally {
      if (useRepoStore.getState().repoPath === originRepoPath) {
        setBusyName(null);
      }
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
                disabled={loading || remoteTagsLoading}
                onClick={() => void refresh()}
              >
                {loading || remoteTagsLoading ? (
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
          <p className="text-muted-foreground px-2 py-3 text-xs">{t("repo.tagsNoMatch")}</p>
        ) : (
          <div
            className="relative w-full min-w-0"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const row = visibleRows[virtualItem.index];
              if (!row) {
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
                  {row.kind === "group" ? (
                    row.id === "local" ? (
                      <BranchGroup
                        icon={<Monitor aria-hidden="true" />}
                        label={`${t("repo.tagsLocal")} (${row.count})`}
                        open={localOpen}
                        onToggle={() => setLocalOpen((prev) => !prev)}
                      />
                    ) : (
                      <BranchGroup
                        icon={<Cloud aria-hidden="true" />}
                        label={`${t("repo.tagsRemote")} (${row.count})`}
                        open={remoteOpen}
                        onToggle={() => setRemoteOpen((prev) => !prev)}
                      />
                    )
                  ) : row.kind === "local" ? (
                    <TagRow
                      tag={row.tag}
                      selected={logRef === row.tag.name}
                      busy={busyName === row.tag.name}
                      remoteKnown={remoteKnown}
                      onRemote={row.onRemote}
                      onSelect={() => void select(row.tag.name)}
                      onCheckout={() => void checkoutTag(row.tag.name)}
                      onCreateBranch={() => deferUi(() => setCreateBranchFrom(row.tag.name))}
                      onCreateTag={() =>
                        deferUi(() => {
                          setCreateTagFrom(row.tag.name);
                          setCreatingTag(true);
                        })
                      }
                      onCopyName={() => void copyName(row.tag.name)}
                      onPushRemote={() => void pushTagToRemote(row.tag.name)}
                      onDelete={() =>
                        openDelete({
                          name: row.tag.name,
                          scope: "local",
                          onRemote: row.onRemote,
                        })
                      }
                    />
                  ) : (
                    <RemoteTagRow
                      tag={row.tag}
                      busy={busyName === row.tag.name}
                      onFetch={() => void fetchTagToLocal(row.tag.name)}
                      onCopyName={() => void copyName(row.tag.name)}
                      onDeleteRemote={() =>
                        openDelete({
                          name: row.tag.name,
                          scope: "remote",
                          onRemote: true,
                        })
                      }
                    />
                  )}
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
        <AppDialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.scope === "remote"
                ? t("repo.deleteTagRemoteTitle")
                : t("repo.deleteTagTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-3">
            <TriangleAlert className="text-chart-4 mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1">
                <p className="text-foreground text-sm">
                  <Trans
                    i18nKey={
                      deleteTarget?.scope === "remote"
                        ? "repo.deleteTagRemoteQuestion"
                        : "repo.deleteTagQuestion"
                    }
                    values={{ name: deleteTarget?.name ?? "" }}
                    components={{
                      name: <span className="font-mono font-medium" />,
                    }}
                  />
                </p>
                <p className="text-muted-foreground text-xs">
                  {deleteTarget?.scope === "remote"
                    ? t("repo.deleteTagRemoteHint")
                    : t("repo.deleteTagIrreversible")}
                </p>
              </div>

              {deleteHasRemote ? (
                <Field orientation="horizontal">
                  <Checkbox
                    id="delete-tag-remote"
                    checked={deleteRemoteAlso}
                    onCheckedChange={(checked) => setDeleteRemoteAlso(checked === true)}
                    disabled={deleteBusy}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="delete-tag-remote">
                      {t("repo.deleteTagRemoteCheckbox")}
                    </FieldLabel>
                    <FieldDescription>{t("repo.deleteTagRemoteCheckboxHint")}</FieldDescription>
                  </FieldContent>
                </Field>
              ) : null}
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
        </AppDialogContent>
      </Dialog>
    </div>
  );
}

interface TagRowProps {
  tag: GitTag;
  selected: boolean;
  busy: boolean;
  /** 远端信息是否已知（无远端/离线时为 false，不展示同步标记） */
  remoteKnown: boolean;
  /** 是否已存在于远端 */
  onRemote: boolean;
  onSelect: () => void;
  onCheckout: () => void;
  onCreateBranch: () => void;
  onCreateTag: () => void;
  onCopyName: () => void;
  onPushRemote: () => void;
  onDelete: () => void;
}

function TagRow({
  tag,
  selected,
  busy,
  remoteKnown,
  onRemote,
  onSelect,
  onCheckout,
  onCreateBranch,
  onCreateTag,
  onCopyName,
  onPushRemote,
  onDelete,
}: TagRowProps) {
  const { t } = useTranslation();

  // 标签信息优先，缺失时兜底展示指向提交的标题
  const message = tag.message?.trim();
  const subject = tag.subject?.trim();
  const infoLabel = message ? t("repo.tagMessage") : t("repo.tagCommitSubject");
  const infoValue = message || subject || "";
  // 远端已知时才展示同步态：不在远端标「未推送」，已同步则不再额外标记
  const showUnpushed = remoteKnown && !onRemote;
  const { menuOpen, onOpenChange } = useContextMenuOpen(onSelect);

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <Tooltip delayDuration={400}>
        <ContextMenuTrigger asChild>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "h-7 w-full min-w-0 justify-start gap-1 overflow-hidden rounded-md px-1.5 text-left text-xs transition-colors [&_svg]:size-3",
                selected || menuOpen
                  ? "bg-accent text-foreground hover:bg-accent"
                  : "text-foreground",
                busy && "cursor-wait",
              )}
              disabled={busy}
              onClick={onSelect}
            >
              {/* 与分支树一致：depth=1 的虚线引导 + 占位（对齐分组图标） */}
              <IndentGuides depth={1} />
              <span className="size-3 shrink-0" aria-hidden="true" />
              {busy ? (
                <Spinner className="size-3 shrink-0" />
              ) : (
                <Tag className="text-muted-foreground shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              {showUnpushed ? (
                <span className="text-muted-foreground shrink-0 text-[10px]">
                  {t("repo.tagUnpushed")}
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
        </ContextMenuTrigger>
        <TooltipContent side="right" className="max-w-xs space-y-0.5 text-left whitespace-normal">
          <p className="font-medium">
            {t("repo.tagName")}：<span className="font-mono">{tag.name}</span>
          </p>
          {infoValue ? (
            <p className="text-background/80 line-clamp-4">
              {infoLabel}：{infoValue}
            </p>
          ) : null}
          {showUnpushed ? <p className="text-background/80">{t("repo.tagUnpushed")}</p> : null}
        </TooltipContent>
      </Tooltip>

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
        {/* 已在远端则无需再推送，按状态禁用 */}
        <ContextMenuItem disabled={busy || (remoteKnown && onRemote)} onSelect={onPushRemote}>
          <Upload className="size-3.5" aria-hidden="true" />
          {t("repo.pushTagToRemote")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* 删除走确认弹窗，本地标签在弹窗内勾选是否同时删远端（与分支一致） */}
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

interface RemoteTagRowProps {
  tag: GitRemoteTag;
  busy: boolean;
  onFetch: () => void;
  onCopyName: () => void;
  onDeleteRemote: () => void;
}

/** 远端独有标签行：本地不存在，点击/菜单可拉取到本地 */
function RemoteTagRow({ tag, busy, onFetch, onCopyName, onDeleteRemote }: RemoteTagRowProps) {
  const { t } = useTranslation();
  const { menuOpen, onOpenChange } = useContextMenuOpen();

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <Tooltip delayDuration={400}>
        <ContextMenuTrigger asChild>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "text-muted-foreground h-7 w-full min-w-0 justify-start gap-1 overflow-hidden rounded-md px-1.5 text-left text-xs transition-colors [&_svg]:size-3",
                "hover:text-foreground",
                menuOpen && "bg-accent text-foreground",
                busy && "cursor-wait",
              )}
              disabled={busy}
              onClick={onFetch}
            >
              {/* 与分支树一致：depth=1 的虚线引导 + 占位（对齐分组图标） */}
              <IndentGuides depth={1} />
              <span className="size-3 shrink-0" aria-hidden="true" />
              {busy ? (
                <Spinner className="size-3 shrink-0" />
              ) : (
                <Tag className="shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
            </Button>
          </TooltipTrigger>
        </ContextMenuTrigger>
        <TooltipContent side="right" className="max-w-xs space-y-0.5 text-left whitespace-normal">
          <p className="font-medium">
            {t("repo.tagName")}：<span className="font-mono">{tag.name}</span>
          </p>
          <p className="text-background/80">{t("repo.tagRemoteOnly")}</p>
        </TooltipContent>
      </Tooltip>

      <ContextMenuContent className="min-w-44">
        <ContextMenuItem disabled={busy} onSelect={onFetch}>
          <Download className="size-3.5" aria-hidden="true" />
          {t("repo.fetchTagToLocal")}
        </ContextMenuItem>
        <ContextMenuItem disabled={busy} onSelect={onCopyName}>
          <Copy className="size-3.5" aria-hidden="true" />
          {t("repo.copyTagName")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={busy}
          className="text-destructive focus:text-destructive"
          onSelect={onDeleteRemote}
        >
          <CloudOff className="size-3.5" aria-hidden="true" />
          {t("repo.deleteTagAction")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
