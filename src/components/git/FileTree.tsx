import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { gitService } from "@/services/git";

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
  onToggle: (path: string) => void;
  childrenCache: Map<string, FsEntry[]>;
  ensureChildren: (path: string) => Promise<void>;
  loadingPaths: Set<string>;
}

function TreeNode({
  entry,
  depth,
  filter,
  expanded,
  onToggle,
  childrenCache,
  ensureChildren,
  loadingPaths,
}: TreeNodeProps) {
  const isOpen = expanded.has(entry.path);
  const children = childrenCache.get(entry.path) ?? [];
  const loading = loadingPaths.has(entry.path);

  const filterLower = filter.trim().toLowerCase();
  const selfMatch =
    filterLower.length === 0 || entry.name.toLowerCase().includes(filterLower);

  // 过滤时：目录若自身不匹配，仍可能因子孙匹配而显示（懒加载限制下仅匹配已加载层）
  if (filterLower.length > 0 && !selfMatch && !entry.isDir) {
    return null;
  }

  async function handleToggle(): Promise<void> {
    if (!entry.isDir) {
      return;
    }

    if (!isOpen) {
      await ensureChildren(entry.path);
    }
    onToggle(entry.path);
  }

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-7 w-full justify-start gap-1 rounded-md px-1.5 py-0 text-left font-normal",
          // 目录可展开；文件暂不可点，勿假 pointer
          entry.isDir ? "cursor-pointer" : "cursor-default",
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
                onToggle={onToggle}
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

  const [filter, setFilter] = useState("");
  const [rootEntries, setRootEntries] = useState<FsEntry[]>([]);
  const [childrenCache, setChildrenCache] = useState<Map<string, FsEntry[]>>(
    () => new Map(),
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loadingRoot, setLoadingRoot] = useState(true);
  const childrenCacheRef = useRef(childrenCache);
  childrenCacheRef.current = childrenCache;

  useEffect(() => {
    let active = true;

    async function loadRoot(): Promise<void> {
      setLoadingRoot(true);
      setError(null);
      setChildrenCache(new Map());
      setExpanded(new Set());

      try {
        const result = await gitService.listDir(repoPath, "");
        if (active) {
          setRootEntries(result.entries);
        }
      } catch (loadError) {
        if (active) {
          setError(toUserMessage(loadError));
          setRootEntries([]);
        }
      } finally {
        if (active) {
          setLoadingRoot(false);
        }
      }
    }

    void loadRoot();

    return () => {
      active = false;
    };
  }, [repoPath]);

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
        <div className="flex h-10 items-center px-3">
          <h2 className="text-muted-foreground text-xs font-semibold">{t("repo.fileTree")}</h2>
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
        <ScrollArea className="h-full px-1.5 py-1">
          {error ? (
            <p className="text-destructive px-2 py-2 text-sm" role="alert">
              {error}
            </p>
          ) : null}

          {loadingRoot ? (
            <p className="text-muted-foreground px-2 py-4 text-sm">{t("common.loading")}</p>
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
                onToggle={toggleExpand}
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
