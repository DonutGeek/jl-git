import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";

import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { gitService } from "@/services/git";

import { toUserMessage } from "@/types/error";
import { FsEntry } from "@/types/git";

type BrowserViewMode = "grid" | "list";

interface WorkspaceBrowserProps {
  repoPath: string;
  repoName: string;
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
export function WorkspaceBrowser({ repoPath, repoName }: WorkspaceBrowserProps) {
  const { t } = useTranslation();

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

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const result = await gitService.listDir(repoPath, relative);
        if (active) {
          setEntries(result.entries);
        }
      } catch (loadError) {
        if (active) {
          setError(toUserMessage(loadError));
          setEntries([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [repoPath, relative]);

  // 换仓库时回到根目录
  useEffect(() => {
    setRelative("");
    setSelectedPath(null);
    setEditingPath(false);
  }, [repoPath]);

  useEffect(() => {
    if (!editingPath) {
      return;
    }
    pathInputRef.current?.focus();
    pathInputRef.current?.select();
  }, [editingPath]);

  const segments = pathSegments(relative);

  function goToRoot(): void {
    setRelative("");
    setSelectedPath(null);
  }

  function goToSegment(index: number): void {
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
  }

  /** 仅目录双击进入；文件暂不打开 Diff */
  function enterEntry(entry: FsEntry): void {
    if (!entry.isDir) {
      setSelectedPath(entry.path);
      return;
    }
    setRelative(entry.path);
    setSelectedPath(null);
  }

  /** 第一击选中；系统双击阈值内的第二击直接进入目录。 */
  function handleEntryClick(event: MouseEvent<HTMLButtonElement>, entry: FsEntry): void {
    if (event.detail === 2) {
      enterEntry(entry);
      return;
    }
    selectEntry(entry);
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
        {editingPath ? (
          <div className="border-input bg-background flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2">
            <span className="text-muted-foreground shrink-0 text-xs">{t("repo.pathLabel")}</span>
            <span className="text-muted-foreground/60 shrink-0 text-xs" aria-hidden="true">
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
              className="h-7 flex-1 border-0 px-0 shadow-none focus-visible:ring-0"
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
            className="border-input bg-background hover:bg-accent/40 flex h-8 min-w-0 flex-1 cursor-text items-center gap-0.5 overflow-hidden rounded-md border px-2 text-left transition-colors"
          >
            <nav
              aria-label={t("repo.workspacePath")}
              className="text-muted-foreground flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-xs"
            >
              <span className="text-muted-foreground/80 shrink-0">{t("repo.pathLabel")}</span>
              <span className="text-muted-foreground/60 shrink-0" aria-hidden="true">
                |
              </span>
              <button
                type="button"
                className="hover:text-foreground shrink-0 cursor-pointer truncate font-medium"
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
                    className="hover:text-foreground max-w-[10rem] cursor-pointer truncate"
                    onClick={(event) => {
                      event.stopPropagation();
                      goToSegment(index);
                    }}
                  >
                    {segment}
                  </button>
                </span>
              ))}
            </nav>
          </div>
        )}

        <div
          className="flex shrink-0 items-center gap-0.5"
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
                  "size-7 transition-colors",
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
                  "size-7 transition-colors",
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
      </header>

      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full p-4">
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
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
    </section>
  );
}
