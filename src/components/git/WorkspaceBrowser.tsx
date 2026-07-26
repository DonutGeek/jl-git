import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, LayoutGrid, List, X } from "lucide-react";
import { toast } from "sonner";

import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { WorkspaceFilePreview } from "@/components/git/WorkspaceFilePreview";
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

import { toUserMessage } from "@/types/error";
import { FsEntry } from "@/types/git";

type BrowserViewMode = "grid" | "list";

interface WorkspaceBrowserProps {
  repoPath: string;
  repoName: string;
  /** 主区分栏保活时：变为可见应重新拉目录 */
  active?: boolean;
}

function pathSegments(relative: string): string[] {
  if (!relative) {
    return [];
  }
  return relative.split("/").filter(Boolean);
}

function joinPath(parts: string[]): string {
  return parts.join("/");
}

/** 规范化用户输入的相对路径：去首尾空白与斜杠，拒绝 `..` */
function normalizeRelativeInput(raw: string): string | null {
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed === "." || trimmed === "/") {
    return "";
  }

  const parts = trimmed.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    return null;
  }

  return parts.join("/");
}

/** 工作区主区：可编辑路径 + 网格/列表浏览；单击选中，双击进入目录 */
export function WorkspaceBrowser({
  repoPath,
  repoName,
  active = true,
}: WorkspaceBrowserProps) {
  const { t } = useTranslation();
  const workspacePreview = useRepoNavStore((state) => state.workspacePreview);
  const openWorkspacePreview = useRepoNavStore((state) => state.openWorkspacePreview);
  const clearWorkspacePreview = useRepoNavStore((state) => state.clearWorkspacePreview);

  const [relative, setRelative] = useState("");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<BrowserViewMode>("grid");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState("");
  const pathInputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);
  const previewNonceRef = useRef(0);

  const previewPath = workspacePreview?.path.replace(/\\/g, "/") ?? null;
  const previewFileName = previewPath?.split("/").pop() ?? null;

  useEffect(() => {
    if (!active || previewPath) {
      return;
    }
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const result = await gitService.listDir(repoPath, relative);
        if (!cancelled) {
          setEntries(result.entries);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(toUserMessage(loadError));
          setEntries([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [active, previewPath, repoPath, relative]);

  // 目录树 / 网格打开文件：同步面包屑父目录与选中项
  useEffect(() => {
    if (!workspacePreview || workspacePreview.nonce === previewNonceRef.current) {
      return;
    }
    previewNonceRef.current = workspacePreview.nonce;
    const path = workspacePreview.path.replace(/\\/g, "/");
    const slash = path.lastIndexOf("/");
    const parent = slash === -1 ? "" : path.slice(0, slash);
    setRelative(parent);
    setSelectedPath(path);
    setEditingPath(false);
  }, [workspacePreview]);

  // 换仓库时回到根目录
  useEffect(() => {
    clearWorkspacePreview();
    setRelative("");
    setSelectedPath(null);
    setEditingPath(false);
  }, [clearWorkspacePreview, repoPath]);

  useEffect(() => {
    if (!editingPath) {
      return;
    }
    pathInputRef.current?.focus();
    pathInputRef.current?.select();
  }, [editingPath]);

  const segments = pathSegments(relative);

  function closePreview(): void {
    clearWorkspacePreview();
    setSelectedPath(null);
  }

  function goToRoot(): void {
    clearWorkspacePreview();
    setRelative("");
    setSelectedPath(null);
  }

  function goToSegment(index: number): void {
    clearWorkspacePreview();
    setRelative(joinPath(segments.slice(0, index + 1)));
    setSelectedPath(null);
  }

  function startEditPath(): void {
    setPathDraft(relative);
    setEditingPath(true);
  }

  function cancelEditPath(): void {
    skipBlurCommitRef.current = true;
    setEditingPath(false);
    setPathDraft(relative);
  }

  function commitEditPath(): void {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }

    const next = normalizeRelativeInput(pathDraft);
    if (next === null) {
      toast.error(t("repo.workspacePathInvalid"));
      pathInputRef.current?.focus();
      return;
    }

    setEditingPath(false);
    clearWorkspacePreview();
    setSelectedPath(null);
    setRelative(next);
  }

  function handlePathKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      skipBlurCommitRef.current = false;
      commitEditPath();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditPath();
    }
  }

  function selectEntry(entry: FsEntry): void {
    setSelectedPath(entry.path);
    if (!entry.isDir) {
      openWorkspacePreview(entry.path);
    }
  }

  /** 目录双击进入；文件单击/双击均打开预览 */
  function enterEntry(entry: FsEntry): void {
    if (!entry.isDir) {
      openWorkspacePreview(entry.path);
      return;
    }
    clearWorkspacePreview();
    setRelative(entry.path);
    setSelectedPath(null);
  }

  /** 第一击选中（文件同时打开预览）；双击进入目录。 */
  function handleEntryClick(event: MouseEvent<HTMLButtonElement>, entry: FsEntry): void {
    if (event.detail === 2) {
      enterEntry(entry);
      return;
    }
    selectEntry(entry);
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="border-border flex h-10 shrink-0 items-center gap-2 border-b px-3">
        {editingPath ? (
          <div className="border-input bg-background flex h-8 min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-md border px-2">
            <span className="text-muted-foreground shrink-0 text-xs leading-none">
              {t("repo.pathLabel")}
            </span>
            <span className="text-muted-foreground/60 shrink-0 text-xs leading-none" aria-hidden="true">
              |
            </span>
            <Input
              ref={pathInputRef}
              value={pathDraft}
              onChange={(event) => setPathDraft(event.target.value)}
              onKeyDown={handlePathKeyDown}
              onBlur={commitEditPath}
              placeholder={t("repo.workspacePathPlaceholder")}
              aria-label={t("repo.workspacePath")}
              className="h-full min-h-0 flex-1 border-0 bg-transparent px-0 py-0 text-xs leading-none shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent md:text-xs"
            />
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={startEditPath}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                startEditPath();
              }
            }}
            aria-label={t("repo.workspacePathEdit")}
            className="border-input bg-background hover:bg-accent/40 flex h-8 min-w-0 flex-1 cursor-text items-center gap-1.5 overflow-hidden rounded-md border px-2 text-left transition-colors"
          >
            <nav
              aria-label={t("repo.workspacePath")}
              className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-xs leading-none"
            >
              <span className="text-muted-foreground/80 shrink-0">{t("repo.pathLabel")}</span>
              <span className="text-muted-foreground/60 shrink-0" aria-hidden="true">
                |
              </span>
              <button
                type="button"
                className="hover:text-foreground shrink-0 cursor-pointer truncate font-medium leading-none"
                onClick={(event) => {
                  event.stopPropagation();
                  goToRoot();
                }}
              >
                {repoName}
              </button>
              {segments.map((segment, index) => (
                <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-0.5">
                  <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  <button
                    type="button"
                    className="hover:text-foreground max-w-[10rem] cursor-pointer truncate leading-none"
                    onClick={(event) => {
                      event.stopPropagation();
                      goToSegment(index);
                    }}
                  >
                    {segment}
                  </button>
                </span>
              ))}
              {previewFileName ? (
                <span className="text-foreground flex min-w-0 items-center gap-0.5">
                  <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  <span className="max-w-[12rem] truncate font-medium leading-none">
                    {previewFileName}
                  </span>
                </span>
              ) : null}
            </nav>
          </div>
        )}

        <div className="flex h-8 shrink-0 items-center gap-0.5">
          {previewPath ? (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-8"
                  aria-label={t("repo.workspaceClosePreview")}
                  onClick={closePreview}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.workspaceClosePreview")}</TooltipContent>
            </Tooltip>
          ) : (
            <div
              className="flex h-8 items-center gap-0.5"
              role="group"
              aria-label={t("repo.workspaceViewMode")}
            >
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-8 transition-colors",
                      viewMode === "grid"
                        ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        : "text-muted-foreground",
                    )}
                    aria-pressed={viewMode === "grid"}
                    aria-label={t("repo.viewGrid")}
                    onClick={() => setViewMode("grid")}
                  >
                    <LayoutGrid className="size-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("repo.viewGrid")}</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-8 transition-colors",
                      viewMode === "list"
                        ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        : "text-muted-foreground",
                    )}
                    aria-pressed={viewMode === "list"}
                    aria-label={t("repo.viewList")}
                    onClick={() => setViewMode("list")}
                  >
                    <List className="size-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("repo.viewList")}</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </header>

      {previewPath ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <WorkspaceFilePreview repoPath={repoPath} filePath={previewPath} />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <ScrollArea className="h-full p-4">
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}

            {loading ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Spinner className="size-4" />
                {t("common.loading")}
              </p>
            ) : entries.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("repo.fileTreeEmpty")}</p>
            ) : viewMode === "grid" ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3">
                {entries.map((entry) => {
                  const selected = selectedPath === entry.path;
                  return (
                    <li key={entry.path}>
                      <button
                        type="button"
                        title={entry.name}
                        className={cn(
                          "hover:bg-accent/60 focus-visible:ring-ring flex w-full cursor-pointer flex-col items-center gap-2 rounded-md px-2 py-3 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none",
                          selected && "bg-primary/10 hover:bg-primary/15",
                        )}
                        onClick={(event) => handleEntryClick(event, entry)}
                      >
                        <MaterialFileIcon name={entry.name} isDir={entry.isDir} className="size-10" />
                        <span className="line-clamp-2 w-full break-all text-xs leading-tight">
                          {entry.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="space-y-0.5">
                {entries.map((entry) => {
                  const selected = selectedPath === entry.path;
                  return (
                    <li key={entry.path}>
                      <button
                        type="button"
                        className={cn(
                          "hover:bg-accent/60 focus-visible:ring-ring flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
                          selected && "bg-primary/10 hover:bg-primary/15",
                        )}
                        onClick={(event) => handleEntryClick(event, entry)}
                      >
                        <MaterialFileIcon
                          name={entry.name}
                          isDir={entry.isDir}
                          className="size-4"
                        />
                        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>
      )}
    </section>
  );
}
