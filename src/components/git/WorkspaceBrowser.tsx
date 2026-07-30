import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { WorkspaceFilePreview } from "@/components/git/WorkspaceFilePreview";
import {
  WorkspaceBrowserChrome,
  type BrowserViewMode,
} from "@/components/git/WorkspaceBrowserChrome";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { gitService } from "@/services/git";
import { useRepoNavStore } from "@/store/useRepoNavStore";

import { toUserMessage } from "@/types/error";
import type { FsEntry } from "@/types/git";

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

/** 若 path 是 dir 下的直接子文件，返回文件名；否则 null */
function fileNameInDir(path: string | null, dir: string): string | null {
  if (!path) {
    return null;
  }
  const normalized = path.replace(/\\/g, "/");
  if (!dir) {
    return normalized.includes("/") ? null : normalized;
  }
  const prefix = `${dir}/`;
  if (!normalized.startsWith(prefix)) {
    return null;
  }
  const rest = normalized.slice(prefix.length);
  return rest.includes("/") ? null : rest;
}

/** 工作区主区：可编辑路径 + 网格/列表浏览；单击选中，双击进入目录 */
export function WorkspaceBrowser({ repoPath, repoName, active = true }: WorkspaceBrowserProps) {
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
  // 预览中或目录浏览选中文件时，面包屑末段显示文件名
  const crumbFileName = previewPath?.split("/").pop() ?? fileNameInDir(selectedPath, relative);
  /** 非根目录，或面包屑正聚焦某文件（未预览）：显示「..」 */
  const showParentEntry = relative !== "" || Boolean(crumbFileName && !previewPath);

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

  /** 点击面包屑文件名：退出预览，以网格/列表展示所在目录 */
  function showCrumbFileInBrowser(): void {
    clearWorkspacePreview();
  }

  /** 「..」：有聚焦文件则先取消聚焦；否则回到上级目录 */
  function goParent(): void {
    clearWorkspacePreview();
    if (relative === "") {
      setSelectedPath(null);
      return;
    }
    const parts = pathSegments(relative);
    parts.pop();
    setRelative(joinPath(parts));
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

  // 小控件用 radius-sm（更「方」）；列表行仍用 rounded-md，与目录树一致
  const crumbButtonClass =
    "hover:bg-accent/60 hover:text-accent-foreground max-w-40 shrink-0 truncate rounded-sm px-1.5 py-0.5 text-xs leading-none transition-colors";

  return (
    <WorkspaceBrowserChrome
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      pathContent={
        editingPath ? (
          <div className="border-input bg-background flex h-8 min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-md border px-2">
            <span className="text-muted-foreground shrink-0 text-xs leading-none">
              {t("repo.pathLabel")}
            </span>
            <span
              className="text-muted-foreground/60 shrink-0 text-xs leading-none"
              aria-hidden="true"
            >
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
          <div className="border-input bg-background flex h-8 min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-md border px-1.5">
            <span className="text-muted-foreground/80 shrink-0 px-0.5 text-xs leading-none">
              {t("repo.pathLabel")}
            </span>
            <span
              className="text-muted-foreground/60 shrink-0 text-xs leading-none"
              aria-hidden="true"
            >
              |
            </span>
            <nav
              aria-label={t("repo.workspacePath")}
              className="text-muted-foreground flex min-w-0 items-center gap-0.5 overflow-hidden"
            >
              <button
                type="button"
                className={cn(crumbButtonClass, "font-medium")}
                onClick={goToRoot}
              >
                {repoName}
              </button>
              {segments.map((segment, index) => (
                <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-0.5">
                  <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  <button
                    type="button"
                    className={crumbButtonClass}
                    onClick={() => goToSegment(index)}
                  >
                    {segment}
                  </button>
                </span>
              ))}
              {crumbFileName ? (
                <span className="flex min-w-0 items-center gap-0.5">
                  <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  <button
                    type="button"
                    className={cn(
                      crumbButtonClass,
                      "text-foreground max-w-48 font-medium",
                      !previewPath && "bg-accent text-accent-foreground",
                    )}
                    aria-current="page"
                    onClick={showCrumbFileInBrowser}
                  >
                    {crumbFileName}
                  </button>
                </span>
              ) : null}
            </nav>
            {/* 仅空白处进入路径编辑，不扩大面包屑 hover */}
            <button
              type="button"
              className="min-h-0 min-w-2 flex-1 cursor-text self-stretch"
              aria-label={t("repo.workspacePathEdit")}
              onClick={startEditPath}
            />
          </div>
        )
      }
    >
      {previewPath ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <WorkspaceFilePreview repoPath={repoPath} filePath={previewPath} />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          {loading ? (
            <div
              className="text-muted-foreground flex h-full min-h-0 items-center justify-center gap-2 text-sm"
              data-workspace-loading="true"
            >
              <Spinner className="size-4" aria-label={t("common.loading")} />
              {t("common.loading")}
            </div>
          ) : (
            <ScrollArea className="h-full p-4">
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}

              {entries.length === 0 && !showParentEntry ? (
                <p className="text-muted-foreground text-sm">{t("repo.fileTreeEmpty")}</p>
              ) : viewMode === "grid" ? (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3">
                  {showParentEntry ? (
                    <li>
                      <button
                        type="button"
                        title={t("repo.workspaceParentDir")}
                        aria-label={t("repo.workspaceParentDir")}
                        className="hover:bg-accent/60 focus-visible:ring-ring flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-md px-1.5 py-2 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        onClick={goParent}
                      >
                        <MaterialFileIcon name="folder" isDir className="size-10" />
                        <span className="line-clamp-2 w-full break-all text-xs leading-tight">
                          ..
                        </span>
                      </button>
                    </li>
                  ) : null}
                  {entries.map((entry) => {
                    const selected = selectedPath === entry.path;
                    return (
                      <li key={entry.path}>
                        <button
                          type="button"
                          title={entry.name}
                          className={cn(
                            "hover:bg-accent/60 focus-visible:ring-ring flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-md px-1.5 py-2 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none",
                            selected && "bg-accent text-accent-foreground hover:bg-accent",
                          )}
                          onClick={(event) => handleEntryClick(event, entry)}
                        >
                          <MaterialFileIcon
                            name={entry.name}
                            isDir={entry.isDir}
                            className="size-10"
                          />
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
                  {showParentEntry ? (
                    <li>
                      <button
                        type="button"
                        aria-label={t("repo.workspaceParentDir")}
                        className="hover:bg-accent/60 focus-visible:ring-ring flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        onClick={goParent}
                      >
                        <MaterialFileIcon name="folder" isDir className="size-3.5" />
                        <span className="min-w-0 flex-1 truncate">..</span>
                      </button>
                    </li>
                  ) : null}
                  {entries.map((entry) => {
                    const selected = selectedPath === entry.path;
                    return (
                      <li key={entry.path}>
                        <button
                          type="button"
                          className={cn(
                            "hover:bg-accent/60 focus-visible:ring-ring flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none",
                            selected && "bg-accent text-accent-foreground hover:bg-accent",
                          )}
                          onClick={(event) => handleEntryClick(event, entry)}
                        >
                          <MaterialFileIcon
                            name={entry.name}
                            isDir={entry.isDir}
                            className="size-3.5"
                          />
                          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          )}
        </div>
      )}
    </WorkspaceBrowserChrome>
  );
}
