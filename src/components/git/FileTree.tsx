import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import {
  FileTreeContextMenu,
  type FileTreeMutation,
} from "@/components/git/FileTreeContextMenu";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { gitService } from "@/services/git";
import { useRepoNavStore } from "@/store/useRepoNavStore";
import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { FsEntry } from "@/types/git";

interface FileTreeProps {
  repoPath: string;
}

interface TreeNodeProps {
  entry: FsEntry;
  depth: number;
  filter: string;
  expanded: Set<string>;
  selectedPath: string | null;
  repoPath: string;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  /** 点击文件时打开工作区预览 */
  onOpenFile?: (path: string) => void;
  onMutated?: (mutation: FileTreeMutation) => void;
  childrenCache: Map<string, FsEntry[]>;
  ensureChildren: (path: string) => Promise<void>;
  loadingPaths: Set<string>;
}

function TreeNode({
  entry,
  depth,
  filter,
  expanded,
  selectedPath,
  repoPath,
  onToggle,
  onSelect,
  onOpenFile,
  onMutated,
  childrenCache,
  ensureChildren,
  loadingPaths,
}: TreeNodeProps) {
  const isOpen = expanded.has(entry.path);
  const selected = selectedPath === entry.path;
  const children = childrenCache.get(entry.path) ?? [];
  const loading = loadingPaths.has(entry.path);
  const rowRef = useRef<HTMLButtonElement | null>(null);

  const filterLower = filter.trim().toLowerCase();
  const selfMatch =
    filterLower.length === 0 || entry.name.toLowerCase().includes(filterLower);
  // 过滤时：目录若自身不匹配，仍可能因子孙匹配而显示（懒加载限制下仅匹配已加载层）
  const hidden =
    filterLower.length > 0 && !selfMatch && !entry.isDir;

  useEffect(() => {
    if (selected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

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

  if (hidden) {
    return null;
  }

  return (
    <div>
      <FileTreeContextMenu
        entry={entry}
        repoPath={repoPath}
        onMenuOpen={() => onSelect(entry.path)}
        onMutated={onMutated}
      >
        <Button
          ref={rowRef}
          type="button"
          variant="ghost"
          className={cn(
            "h-7 w-full justify-start gap-1 rounded-md px-1.5 py-0 text-left font-normal cursor-pointer",
            selected && "bg-accent text-accent-foreground",
          )}
          style={{ paddingLeft: `${6 + depth * 12}px` }}
          onClick={() => void handleToggle()}
          disabled={!entry.isDir && filterLower.length > 0 && !selfMatch}
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

          <MaterialFileIcon
            name={entry.name}
            isDir={entry.isDir}
            className="size-3.5"
          />

          <span className="min-w-0 flex-1 truncate text-xs">{entry.name}</span>
        </Button>
      </FileTreeContextMenu>

      {entry.isDir && isOpen ? (
        <div>
          {loading ? (
            <p
              className="text-muted-foreground px-2 py-1 text-[11px]"
              style={{ paddingLeft: `${18 + depth * 12}px` }}
            >
              …
            </p>
          ) : (
            children.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                filter={filter}
                expanded={expanded}
                selectedPath={selectedPath}
                repoPath={repoPath}
                onToggle={onToggle}
                onSelect={onSelect}
                onOpenFile={onOpenFile}
                onMutated={onMutated}
                childrenCache={childrenCache}
                ensureChildren={ensureChildren}
                loadingPaths={loadingPaths}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/** 仓库目录树：懒加载展开（状态字母仅在变更列表展示） */
export function FileTree({ repoPath }: FileTreeProps) {
  const { t } = useTranslation();
  const fileTreeReveal = useRepoNavStore((state) => state.fileTreeReveal);
  const openWorkspacePreview = useRepoNavStore((state) => state.openWorkspacePreview);
  const clearWorkspacePreview = useRepoNavStore((state) => state.clearWorkspacePreview);
  const workspacePreviewPath = useRepoNavStore(
    (state) => state.workspacePreview?.path ?? null,
  );
  const refreshStatus = useRepoStore((state) => state.refreshStatus);

  const [filter, setFilter] = useState("");
  const [rootEntries, setRootEntries] = useState<FsEntry[]>([]);
  const [childrenCache, setChildrenCache] = useState<Map<string, FsEntry[]>>(
    () => new Map(),
  );
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

  const filterLower = filter.trim().toLowerCase();
  const visibleRoot =
    filterLower.length === 0
      ? rootEntries
      : rootEntries.filter(
          (entry) =>
            entry.name.toLowerCase().includes(filterLower) || entry.isDir,
        );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <div className="flex h-10 items-center gap-1 px-3">
          <h2 className="text-muted-foreground min-w-0 flex-1 text-xs font-semibold">
            {t("repo.fileTree")}
          </h2>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-7 shrink-0 [&_svg]:size-3.5"
                aria-label={t("repo.refresh")}
                disabled={refreshing || loadingRoot}
                onClick={() => {
                  void handleRefresh();
                }}
              >
                {refreshing ? (
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
            className="h-8 text-xs shadow-none"
            aria-label={t("repo.filter")}
          />
        </div>
      </div>

      {/* ScrollArea 需明确高度：外层 flex-1 定高，内层 h-full 滚动 */}
      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full px-3 py-1">
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
          ) : visibleRoot.length === 0 ? (
            <p className="text-muted-foreground px-2 py-4 text-sm">{t("repo.fileTreeEmpty")}</p>
          ) : (
            visibleRoot.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                filter={filter}
                expanded={expanded}
                selectedPath={selectedPath}
                repoPath={repoPath}
                onToggle={toggleExpand}
                onSelect={setSelectedPath}
                onOpenFile={handleOpenFile}
                onMutated={(mutation) => {
                  void handleMutated(mutation);
                }}
                childrenCache={childrenCache}
                ensureChildren={ensureChildren}
                loadingPaths={loadingPaths}
              />
            ))
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
