import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { FileTreeContextMenu, type FileTreeMutation } from "@/components/git/FileTreeContextMenu";
import { FileTreeChrome } from "@/components/git/FileTreeChrome";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";

import { gitService } from "@/services/git";
import { useRepoNavStore } from "@/store/useRepoNavStore";
import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import type { FsEntry } from "@/types/git";
import { flattenVisibleFileTreeRows, type FileTreeVisibleRow } from "@/utils/fileTreeRows";

interface FileTreeProps {
  repoPath: string;
}

const FILE_TREE_ROW_HEIGHT_PX = 28;
const FILE_TREE_VIRTUAL_OVERSCAN = 12;

interface FileTreeRowProps {
  row: FileTreeVisibleRow;
  expanded: Set<string>;
  selectedPath: string | null;
  repoPath: string;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  /** 点击文件时打开工作区预览 */
  onOpenFile?: (path: string) => void;
  onMutated?: (mutation: FileTreeMutation) => void;
  ensureChildren: (path: string) => Promise<void>;
  loadingPaths: Set<string>;
}

function FileTreeRow({
  row,
  expanded,
  selectedPath,
  repoPath,
  onToggle,
  onSelect,
  onOpenFile,
  onMutated,
  ensureChildren,
  loadingPaths,
}: FileTreeRowProps) {
  const { entry, depth } = row;
  const isOpen = expanded.has(entry.path);
  const selected = selectedPath === entry.path;
  const loading = loadingPaths.has(entry.path);

  async function handleToggle(): Promise<void> {
    onSelect(entry.path);
    if (!entry.isDir) {
      onOpenFile?.(entry.path);
      return;
    }

    if (!isOpen) {
      await ensureChildren(entry.path);
    }
    onToggle(entry.path);
  }

  return (
    <FileTreeContextMenu
      entry={entry}
      repoPath={repoPath}
      onMenuOpen={() => onSelect(entry.path)}
      onMutated={onMutated}
    >
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-7 w-full justify-start gap-1 rounded-md px-1.5 py-0 text-left font-normal cursor-pointer",
          selected && "bg-accent text-accent-foreground",
        )}
        style={{ paddingLeft: `${6 + depth * 12}px` }}
        onClick={() => void handleToggle()}
      >
        {entry.isDir ? (
          isOpen ? (
            <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
          )
        ) : (
          <span className="size-3.5 shrink-0" aria-hidden="true" />
        )}

        <MaterialFileIcon name={entry.name} isDir={entry.isDir} className="size-3.5" />

        <span className="min-w-0 flex-1 truncate text-xs">{entry.name}</span>
        {loading ? <span className="text-muted-foreground text-[11px]">…</span> : null}
      </Button>
    </FileTreeContextMenu>
  );
}

/** 仓库目录树：懒加载展开（状态字母仅在变更列表展示） */
export function FileTree({ repoPath }: FileTreeProps) {
  const { t } = useTranslation();
  const fileTreeReveal = useRepoNavStore((state) => state.fileTreeReveal);
  const openWorkspacePreview = useRepoNavStore((state) => state.openWorkspacePreview);
  const clearWorkspacePreview = useRepoNavStore((state) => state.clearWorkspacePreview);
  const workspacePreviewPath = useRepoNavStore((state) => state.workspacePreview?.path ?? null);
  const refreshStatus = useRepoStore((state) => state.refreshStatus);

  const [filter, setFilter] = useState("");
  const [rootEntries, setRootEntries] = useState<FsEntry[]>([]);
  const [childrenCache, setChildrenCache] = useState<Map<string, FsEntry[]>>(() => new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loadingRoot, setLoadingRoot] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const childrenCacheRef = useRef(childrenCache);
  childrenCacheRef.current = childrenCache;
  const loadGenerationRef = useRef(0);
  const ensureChildrenRef = useRef<(path: string) => Promise<void>>(async () => {});
  const revealNonceRef = useRef(0);
  const { viewport, bindScrollArea } = useScrollAreaViewport();

  const loadRoot = useCallback(async (): Promise<void> => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    setLoadingRoot(true);
    setError(null);
    setChildrenCache(new Map());
    setExpanded(new Set());
    setLoadingPaths(new Set());

    try {
      const result = await gitService.listDir(repoPath, "");
      if (loadGenerationRef.current !== generation) {
        return;
      }
      setRootEntries(result.entries);
    } catch (loadError) {
      if (loadGenerationRef.current !== generation) {
        return;
      }
      setError(toUserMessage(loadError));
      setRootEntries([]);
      throw loadError;
    } finally {
      if (loadGenerationRef.current === generation) {
        setLoadingRoot(false);
      }
    }
  }, [repoPath]);

  useEffect(() => {
    void loadRoot().catch(() => {
      // 首屏错误已写入 error 区，不再 toast
    });
  }, [loadRoot]);

  async function handleRefresh(): Promise<void> {
    if (refreshing || loadingRoot) {
      return;
    }
    setRefreshing(true);
    const toastId = toast.loading(t("repo.refreshStart"));
    try {
      await loadRoot();
      toast.success(t("repo.refreshSuccess"), { id: toastId });
    } catch (refreshError) {
      toast.error(toUserMessage(refreshError), { id: toastId });
    } finally {
      setRefreshing(false);
    }
  }

  const ensureChildren = useCallback(
    async (path: string): Promise<void> => {
      if (childrenCacheRef.current.has(path)) {
        return;
      }

      setLoadingPaths((prev) => new Set(prev).add(path));

      try {
        const result = await gitService.listDir(repoPath, path);
        setChildrenCache((prev) => {
          const next = new Map(prev);
          next.set(path, result.entries);
          return next;
        });
      } catch (loadError) {
        setError(toUserMessage(loadError));
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    },
    [repoPath],
  );
  ensureChildrenRef.current = ensureChildren;

  function toggleExpand(path: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  // 从变更面板定位到目录树
  useEffect(() => {
    if (!fileTreeReveal || fileTreeReveal.nonce === revealNonceRef.current) {
      return;
    }
    revealNonceRef.current = fileTreeReveal.nonce;
    const target = fileTreeReveal.path.replace(/\\/g, "/");
    const parts = target.split("/").filter(Boolean);
    if (parts.length === 0) {
      return;
    }

    setFilter("");
    setSelectedPath(target);

    void (async () => {
      const folders: string[] = [];
      for (let i = 0; i < parts.length - 1; i += 1) {
        folders.push(parts.slice(0, i + 1).join("/"));
      }
      for (const folder of folders) {
        await ensureChildrenRef.current(folder);
      }
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const folder of folders) {
          next.add(folder);
        }
        return next;
      });
    })();
  }, [fileTreeReveal]);

  // 工作区预览路径变化时同步目录树选中
  useEffect(() => {
    if (workspacePreviewPath) {
      setSelectedPath(workspacePreviewPath.replace(/\\/g, "/"));
    }
  }, [workspacePreviewPath]);

  function handleOpenFile(path: string): void {
    openWorkspacePreview(path.replace(/\\/g, "/"));
  }

  async function handleMutated(mutation: FileTreeMutation): Promise<void> {
    const preview = workspacePreviewPath?.replace(/\\/g, "/") ?? null;

    if (mutation.type === "create") {
      const parent = mutation.parentPath.replace(/\\/g, "/");
      const created = mutation.path.replace(/\\/g, "/");
      setExpanded((prev) => new Set(prev).add(parent));
      setSelectedPath(created);
      try {
        const [parentListing, root] = await Promise.all([
          gitService.listDir(repoPath, parent),
          gitService.listDir(repoPath, ""),
        ]);
        setChildrenCache((prev) => {
          const next = new Map(prev);
          next.set(parent, parentListing.entries);
          childrenCacheRef.current = next;
          return next;
        });
        setRootEntries(root.entries);
      } catch (error) {
        setError(toUserMessage(error));
      }
      if (!mutation.isDir) {
        openWorkspacePreview(created);
      }
      void refreshStatus();
      return;
    }

    if (mutation.type === "delete") {
      const deleted = mutation.path.replace(/\\/g, "/");
      if (preview === deleted || preview?.startsWith(`${deleted}/`)) {
        clearWorkspacePreview();
      }
      if (selectedPath === deleted || selectedPath?.startsWith(`${deleted}/`)) {
        setSelectedPath(null);
      }
    } else {
      const from = mutation.from.replace(/\\/g, "/");
      const to = mutation.to.replace(/\\/g, "/");
      if (preview === from) {
        openWorkspacePreview(to);
      } else if (preview?.startsWith(`${from}/`)) {
        clearWorkspacePreview();
      }
      if (selectedPath === from) {
        setSelectedPath(to);
      }
    }

    try {
      await loadRoot();
    } catch {
      // 错误已写入 error 区
    }
    void refreshStatus();
  }

  const visibleRows = useMemo(
    () => flattenVisibleFileTreeRows(rootEntries, expanded, childrenCache, filter),
    [childrenCache, expanded, filter, rootEntries],
  );
  const virtualizer = useVirtualizer({
    count: loadingRoot ? 0 : visibleRows.length,
    getScrollElement: () => viewport,
    estimateSize: () => FILE_TREE_ROW_HEIGHT_PX,
    overscan: FILE_TREE_VIRTUAL_OVERSCAN,
    getItemKey: (index) => visibleRows[index]?.entry.path ?? index,
  });

  useEffect(() => {
    if (!selectedPath) {
      return;
    }
    const selectedIndex = visibleRows.findIndex((row) => row.entry.path === selectedPath);
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [selectedPath, virtualizer, visibleRows]);

  return (
    <FileTreeChrome
      filter={filter}
      refreshing={refreshing}
      dataPending={loadingRoot}
      onFilterChange={setFilter}
      onRefresh={() => void handleRefresh()}
    >
      {/* ScrollArea 需明确高度：外层 flex-1 定高，内层 h-full 滚动 */}
      <div className="min-h-0 flex-1">
        <ScrollArea
          ref={bindScrollArea}
          className="h-full px-3 py-1 [&_[data-slot=scroll-area-viewport]>div]:block! [&_[data-slot=scroll-area-viewport]>div]:min-w-0! [&_[data-slot=scroll-area-viewport]>div]:w-full"
        >
          {error ? (
            <p className="text-destructive px-2 py-2 text-sm" role="alert">
              {error}
            </p>
          ) : null}

          {loadingRoot ? (
            <p className="text-muted-foreground flex items-center gap-2 px-2 py-4 text-sm">
              <Spinner className="size-4" />
              {t("common.loading")}
            </p>
          ) : visibleRows.length === 0 ? (
            <p className="text-muted-foreground px-2 py-4 text-sm">{t("repo.fileTreeEmpty")}</p>
          ) : (
            <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const row = visibleRows[virtualItem.index];
                if (!row) {
                  return null;
                }
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    className="absolute top-0 left-0 w-full"
                    style={{
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <FileTreeRow
                      row={row}
                      expanded={expanded}
                      selectedPath={selectedPath}
                      repoPath={repoPath}
                      onToggle={toggleExpand}
                      onSelect={setSelectedPath}
                      onOpenFile={handleOpenFile}
                      onMutated={(mutation) => {
                        void handleMutated(mutation);
                      }}
                      ensureChildren={ensureChildren}
                      loadingPaths={loadingPaths}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </FileTreeChrome>
  );
}
