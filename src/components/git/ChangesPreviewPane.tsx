import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type RefCallback,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  DiffEditor,
  Editor,
  type DiffOnMount,
  type Monaco,
  type OnMount,
} from "@monaco-editor/react";
import {
  ChevronDown,
  ChevronUp,
  Columns2,
  Eye,
  EyeOff,
  FileText,
  FoldVertical,
  List,
  Menu,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DiffSidePreview, type DiffPreviewChange } from "@/components/git/DiffSidePreview";
import { CodeSidePreview } from "@/components/git/CodeSidePreview";
import { cn } from "@/lib/utils";

import {
  applyJlGitMonacoTheme,
  forceMonacoThemeRepaint,
  getJlGitMonacoThemeName,
} from "@/design/monaco.theme";
import { gitService } from "@/services/git";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";
import type { GitDiffResult, GitStatusEntry } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import {
  gitStatusLetterClass,
  normalizeGitStatusLetter,
} from "@/utils/gitStatusStyle";
import {
  DEFAULT_TEXT_ENCODING,
  TEXT_ENCODING_OPTIONS,
} from "@/utils/textEncodings";

type PreviewMode = "diff" | "file";
/** 差异布局：单栏（内联）/ 多栏（左右分栏） */
type DiffLayout = "inline" | "sideBySide";

interface HostSize {
  width: number;
  height: number;
}

/** 稳定空数组：避免 selector 每次返回新 [] */
const EMPTY_ENTRIES: GitStatusEntry[] = [];

/** 根据扩展名推断 Monaco language id */
function languageFromPath(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? filePath;
  const lower = name.toLowerCase();
  if (lower === "dockerfile") {
    return "dockerfile";
  }
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "markdown";
    case "rs":
      return "rust";
    case "py":
      return "python";
    case "go":
      return "go";
    case "css":
      return "css";
    case "scss":
      return "scss";
    case "html":
    case "htm":
      return "html";
    case "yml":
    case "yaml":
      return "yaml";
    case "toml":
      return "ini";
    case "sh":
    case "bash":
    case "zsh":
      return "shell";
    case "sql":
      return "sql";
    case "xml":
    case "svg":
      return "xml";
    default:
      return "plaintext";
  }
}

function readMonoFont(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-mono")
    .trim();
  return value || "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
}

function isDocumentDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

/** 从文本内容推断换行符展示 */
function detectLineEnding(text: string): "LF" | "CRLF" | "CR" {
  if (text.includes("\r\n")) {
    return "CRLF";
  }
  if (text.includes("\r")) {
    return "CR";
  }
  return "LF";
}

/** 跳转到上一个 / 下一个差异块（文件内 hunk，非文件列表） */
function navigateDiffHunk(
  editor: Parameters<DiffOnMount>[0],
  direction: "prev" | "next",
): void {
  // 新版 Monaco 自带 goToDiff；类型定义可能未收录
  const withGoToDiff = editor as Parameters<DiffOnMount>[0] & {
    goToDiff?: (dir: "next" | "previous") => void;
  };
  if (typeof withGoToDiff.goToDiff === "function") {
    withGoToDiff.goToDiff(direction === "next" ? "next" : "previous");
    return;
  }

  const changes = editor.getLineChanges();
  if (!changes || changes.length === 0) {
    return;
  }

  const modified = editor.getModifiedEditor();
  const currentLine = modified.getPosition()?.lineNumber ?? 1;

  let currentIndex = -1;
  for (let i = 0; i < changes.length; i += 1) {
    const change = changes[i];
    if (!change) {
      continue;
    }
    const start = change.modifiedStartLineNumber;
    const end =
      change.modifiedEndLineNumber > 0
        ? change.modifiedEndLineNumber
        : change.modifiedStartLineNumber;
    if (start > 0 && currentLine >= start && currentLine <= end) {
      currentIndex = i;
      break;
    }
  }

  let targetIndex = -1;
  if (direction === "next") {
    if (currentIndex >= 0) {
      targetIndex = currentIndex + 1;
    } else {
      targetIndex = changes.findIndex(
        (change) => change.modifiedStartLineNumber > currentLine,
      );
    }
  } else if (currentIndex >= 0) {
    targetIndex = currentIndex - 1;
  } else {
    for (let i = changes.length - 1; i >= 0; i -= 1) {
      const change = changes[i];
      if (change && change.modifiedStartLineNumber < currentLine) {
        targetIndex = i;
        break;
      }
    }
  }

  const target = targetIndex >= 0 ? changes[targetIndex] : undefined;
  if (!target) {
    return;
  }

  const line =
    target.modifiedStartLineNumber > 0
      ? target.modifiedStartLineNumber
      : Math.max(1, target.originalStartLineNumber);

  modified.revealLineInCenter(line);
  modified.setPosition({ lineNumber: line, column: 1 });
  modified.focus();
}

const monacoCommonOptions = {
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 12,
  lineNumbers: "on" as const,
  automaticLayout: false,
  wordWrap: "off" as const,
  renderLineHighlight: "none" as const,
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  renderOverviewRuler: false,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
    useShadows: false,
    vertical: "auto" as const,
  },
};

/**
 * 左右 Diff 滚动联动：滚一侧另一侧跟随；左侧隐藏竖条，视觉上共用右侧滚动条。
 */
function bindDiffScrollSync(diffEditor: Parameters<DiffOnMount>[0]): () => void {
  const original = diffEditor.getOriginalEditor();
  const modified = diffEditor.getModifiedEditor();

  // 左侧不单独显示竖滚动条，滚轮仍可驱动（由同步传到右侧）
  original.updateOptions({
    minimap: { enabled: false },
    scrollbar: {
      vertical: "hidden",
      horizontal: "auto",
      handleMouseWheel: true,
      alwaysConsumeMouseWheel: false,
      useShadows: false,
      verticalScrollbarSize: 0,
    },
  });
  modified.updateOptions({
    minimap: { enabled: false },
    scrollbar: {
      vertical: "auto",
      horizontal: "auto",
      handleMouseWheel: true,
      useShadows: false,
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
  });

  let syncing = false;

  const syncFromOriginal = original.onDidScrollChange((event) => {
    if (syncing) {
      return;
    }
    syncing = true;
    modified.setScrollTop(event.scrollTop);
    modified.setScrollLeft(event.scrollLeft);
    syncing = false;
  });

  const syncFromModified = modified.onDidScrollChange((event) => {
    if (syncing) {
      return;
    }
    syncing = true;
    original.setScrollTop(event.scrollTop);
    original.setScrollLeft(event.scrollLeft);
    syncing = false;
  });

  return () => {
    syncFromOriginal.dispose();
    syncFromModified.dispose();
  };
}

/** 用 callback ref 测量宿主；remeasureKey 变化时强制重测（如文件/差异视图切换） */
function useMonacoHostSize(remeasureKey: string): {
  setHost: RefCallback<HTMLDivElement>;
  size: HostSize;
} {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<HostSize>({ width: 0, height: 0 });

  useEffect(() => {
    // 切换视图时先清零，避免沿用更窄侧栏时的旧宽度留下空白
    setSize({ width: 0, height: 0 });
  }, [remeasureKey]);

  useEffect(() => {
    if (!host) {
      setSize({ width: 0, height: 0 });
      return;
    }

    const update = (): void => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(0, Math.floor(rect.width));
      const height = Math.max(0, Math.floor(rect.height));
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    update();
    // 侧栏宽度变化后，等 flex 布局稳定再测一次
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(update);
    });
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [host, remeasureKey]);

  return { setHost, size };
}

interface ToolIconButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}

function ToolIconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: ToolIconButtonProps) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "size-6 shrink-0 [&_svg]:size-3.5",
            pressed
              ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** 变更主区右侧：文件视图 / 差异视图（Monaco） */
export function ChangesPreviewPane() {
  const { t } = useTranslation();
  const repoPath = useRepoStore((state) => state.repoPath);
  const selectedChange = useRepoStore((state) => state.selectedChange);
  const entries = useRepoStore((state) => state.status?.entries ?? EMPTY_ENTRIES);

  const [mode, setMode] = useState<PreviewMode>("diff");
  const [diffLayout, setDiffLayout] = useState<DiffLayout>("sideBySide");
  const [foldUnchanged, setFoldUnchanged] = useState(false);
  const [encoding, setEncoding] = useState(DEFAULT_TEXT_ENCODING);
  const [diffHidden, setDiffHidden] = useState(false);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(isDocumentDark);
  const monacoRef = useRef<Monaco | null>(null);
  const diffEditorRef = useRef<Parameters<DiffOnMount>[0] | null>(null);
  const fileEditorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const scrollSyncDisposeRef = useRef<(() => void) | null>(null);
  const previewDisposeRef = useRef<(() => void) | null>(null);
  const { setHost, size } = useMonacoHostSize(`${mode}:${diffLayout}`);
  const [previewChanges, setPreviewChanges] = useState<DiffPreviewChange[]>([]);
  const [previewViewport, setPreviewViewport] = useState<{
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      scrollSyncDisposeRef.current?.();
      scrollSyncDisposeRef.current = null;
      previewDisposeRef.current?.();
      previewDisposeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const sync = (): void => {
      setDark(root.classList.contains("dark"));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // 明暗切换：等 CSS 变量生效后再刷 Monaco + 强制重绘（否则要滚动才变色）
  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        if (monacoRef.current) {
          applyJlGitMonacoTheme(monacoRef.current);
        }
        forceMonacoThemeRepaint(diffEditorRef.current, fileEditorRef.current);
        // 触发右侧预览图按新 token 重绘
        setPreviewViewport((prev) => (prev ? { ...prev } : prev));
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [dark]);

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) {
      return;
    }
    diffEditorRef.current?.layout({ width: size.width, height: size.height });
    fileEditorRef.current?.layout({ width: size.width, height: size.height });
  }, [size]);

  function handleBeforeMount(monaco: Monaco): void {
    monacoRef.current = monaco;
    applyJlGitMonacoTheme(monaco);
  }

  const handleDiffMount: DiffOnMount = (editor, monaco) => {
    diffEditorRef.current = editor;
    if (size.width > 0 && size.height > 0) {
      editor.layout({ width: size.width, height: size.height });
    }

    // 两侧都关闭内置 minimap，预览图改用右侧独立组件
    editor.getOriginalEditor().updateOptions({ minimap: { enabled: false } });
    editor.getModifiedEditor().updateOptions({ minimap: { enabled: false } });

    scrollSyncDisposeRef.current?.();
    scrollSyncDisposeRef.current = null;
    if (diffLayout === "sideBySide") {
      scrollSyncDisposeRef.current = bindDiffScrollSync(editor);
    }

    previewDisposeRef.current?.();
    const modified = editor.getModifiedEditor();
    const syncViewport = (): void => {
      const layout = modified.getLayoutInfo();
      setPreviewViewport({
        scrollTop: modified.getScrollTop(),
        scrollHeight: modified.getScrollHeight(),
        clientHeight: layout.height,
      });
    };
    const syncChanges = (): void => {
      const lineChanges = editor.getLineChanges() ?? [];
      const scrollHeight = Math.max(1, modified.getScrollHeight());
      const lineHeight = Math.max(
        1,
        modified.getOption(monaco.editor.EditorOption.lineHeight),
      );
      const markers: DiffPreviewChange[] = [];

      for (const change of lineChanges) {
        const hasModified = change.modifiedEndLineNumber > 0;
        const hasOriginal = change.originalEndLineNumber > 0;
        const originalCount = hasOriginal
          ? change.originalEndLineNumber - change.originalStartLineNumber + 1
          : 0;

        // 删除：在 modified 锚点画红块（高度按删除行数，贴近示例）
        if (hasOriginal) {
          const anchorLine = Math.max(1, change.modifiedStartLineNumber || 1);
          const top = modified.getTopForLineNumber(anchorLine);
          markers.push({
            topRatio: top / scrollHeight,
            heightRatio: Math.max(
              2 / scrollHeight,
              (originalCount * lineHeight) / scrollHeight,
            ),
            kind: "delete",
          });
        }

        // 新增：绿块对齐 modified 行区间
        if (hasModified) {
          const start = change.modifiedStartLineNumber;
          const end = change.modifiedEndLineNumber;
          const top = modified.getTopForLineNumber(start);
          const bottom = modified.getTopForLineNumber(end) + lineHeight;
          markers.push({
            topRatio: top / scrollHeight,
            heightRatio: Math.max(2 / scrollHeight, (bottom - top) / scrollHeight),
            kind: "add",
          });
        }
      }

      setPreviewChanges(markers);
    };
    syncViewport();
    syncChanges();
    const scrollSub = modified.onDidScrollChange(syncViewport);
    const diffSub = editor.onDidUpdateDiff(syncChanges);
    previewDisposeRef.current = () => {
      scrollSub.dispose();
      diffSub.dispose();
    };
  };

  const handleFileMount: OnMount = (editor) => {
    fileEditorRef.current = editor;
    if (size.width > 0 && size.height > 0) {
      editor.layout({ width: size.width, height: size.height });
    }

    previewDisposeRef.current?.();
    const syncViewport = (): void => {
      const layout = editor.getLayoutInfo();
      setPreviewViewport({
        scrollTop: editor.getScrollTop(),
        scrollHeight: editor.getScrollHeight(),
        clientHeight: layout.height,
      });
    };
    syncViewport();
    const scrollSub = editor.onDidScrollChange(syncViewport);
    previewDisposeRef.current = () => {
      scrollSub.dispose();
    };
  };

  // 切换文件时恢复显示差异
  useEffect(() => {
    setDiffHidden(false);
    setPreviewChanges([]);
    setPreviewViewport(null);
  }, [selectedChange?.path, selectedChange?.side]);

  useEffect(() => {
    if (!repoPath || !selectedChange) {
      setDiff(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void gitService
      .getDiff(repoPath, {
        filePath: selectedChange.path,
        staged: selectedChange.side === "index",
        encoding,
      })
      .then((result) => {
        if (!cancelled) {
          setDiff(result);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setDiff(null);
          setError(toUserMessage(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repoPath, selectedChange, encoding]);

  if (!selectedChange) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
        <FileText className="text-muted-foreground size-10 opacity-50" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("repo.diffPreviewTitle")}</p>
          <p className="text-muted-foreground max-w-sm text-xs">
            {t("repo.diffPreviewHint")}
          </p>
        </div>
      </div>
    );
  }

  const language = languageFromPath(selectedChange.path);
  const filePath = selectedChange.path;
  const fontFamily = readMonoFont();
  const baseLabel =
    selectedChange.side === "index"
      ? t("repo.diffBaseStaged")
      : t("repo.diffBaseUnstaged");
  const localLabel =
    selectedChange.side === "index"
      ? t("repo.diffLocalStaged")
      : t("repo.diffLocalUnstaged");

  const statusEntry = entries.find((entry) => entry.path === selectedChange.path);
  const statusLetter = statusEntry
    ? normalizeGitStatusLetter(
        selectedChange.side === "index"
          ? statusEntry.indexStatus
          : statusEntry.worktreeStatus,
      )
    : null;

  const editorKey = `${selectedChange.side}:${selectedChange.path}:${mode}:${diffLayout}:${foldUnchanged ? "fold" : "full"}`;
  const ready = size.width > 0 && size.height > 0;
  const baseEol = diff ? detectLineEnding(diff.oldText) : "LF";
  const localEol = diff ? detectLineEnding(diff.newText) : "LF";
  const diffToolsDisabled = mode !== "diff";
  const sideBySide = diffLayout === "sideBySide";
  const monacoTheme = getJlGitMonacoThemeName(dark);
  const canNavigateHunk =
    mode === "diff" && !loading && Boolean(diff) && !diff?.binary;

  function handleComingSoon(): void {
    toast.message(t("repo.diffComingSoon"));
  }

  function goPrevHunk(): void {
    if (!diffEditorRef.current || !canNavigateHunk) {
      return;
    }
    navigateDiffHunk(diffEditorRef.current, "prev");
  }

  function goNextHunk(): void {
    if (!diffEditorRef.current || !canNavigateHunk) {
      return;
    }
    navigateDiffHunk(diffEditorRef.current, "next");
  }

  async function copyPath(): Promise<void> {
    try {
      await copyToClipboard(filePath);
      toast.success(t("repo.copySuccess"));
    } catch (copyError) {
      toast.error(toUserMessage(copyError) || t("repo.copyFailed"));
    }
  }

  return (
    <div className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      {/* 路径行：眼睛切换显示/隐藏差异 + 状态字母 + 可点击复制路径 */}
      <div className="border-border flex h-8 shrink-0 items-center gap-1.5 border-b px-2">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 shrink-0 [&_svg]:size-3.5"
              aria-label={diffHidden ? t("repo.diffShow") : t("repo.diffHide")}
              aria-pressed={diffHidden}
              onClick={() => setDiffHidden((prev) => !prev)}
            >
              {diffHidden ? (
                <EyeOff aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {diffHidden ? t("repo.diffShow") : t("repo.diffHide")}
          </TooltipContent>
        </Tooltip>
        {statusLetter ? (
          <span
            className={cn(
              "w-3.5 shrink-0 text-center font-mono text-[11px] leading-none font-semibold",
              gitStatusLetterClass(statusLetter),
            )}
            aria-label={statusLetter}
          >
            {statusLetter}
          </span>
        ) : null}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="hover:text-foreground min-w-0 flex-1 cursor-pointer truncate text-left font-mono text-xs underline-offset-2 hover:underline"
              aria-label={t("repo.copyPath")}
              onClick={() => {
                void copyPath();
              }}
            >
              {selectedChange.path}
            </button>
          </TooltipTrigger>
          {/* 顶栏下方是工具行，tooltip 放上方避免遮挡 */}
          <TooltipContent side="top">{t("repo.copyPath")}</TooltipContent>
        </Tooltip>
      </div>

      {diffHidden ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <EyeOff
            className="text-muted-foreground size-12 opacity-40"
            aria-hidden="true"
          />
          <p className="text-muted-foreground text-sm">{t("repo.diffHide")}</p>
        </div>
      ) : (
        <>
      {/* 工具行：左编码 · 中视图切换 · 右操作按钮 */}
      <div className="border-border relative flex h-8 shrink-0 items-center border-b px-1.5">
        <SelectMenu
          value={encoding}
          onChange={setEncoding}
          ariaLabel={t("repo.diffEncodingSelect")}
          size="sm"
          options={TEXT_ENCODING_OPTIONS.map((option) => ({
            value: option.id,
            label: option.label,
          }))}
          triggerClassName="border-border z-10 h-6 w-auto max-w-[9rem] shrink-0 rounded-md border px-1.5 text-[11px] font-normal tabular-nums shadow-none"
          contentClassName="min-w-[10rem] font-mono"
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="bg-muted/60 pointer-events-auto flex items-center gap-0.5 rounded-md p-0.5"
            role="tablist"
            aria-label={t("repo.diffViewMode")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "file"}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-0.5 text-[11px] transition-colors",
                mode === "file"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMode("file")}
            >
              {t("repo.diffFileView")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "diff"}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-0.5 text-[11px] transition-colors",
                mode === "diff"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMode("diff")}
            >
              {t("repo.diffDiffView")}
            </button>
          </div>
        </div>

        <div className="z-10 ml-auto flex shrink-0 items-center gap-0.5">
          <ToolIconButton
            label={t("repo.diffPrevChange")}
            disabled={!canNavigateHunk}
            onClick={goPrevHunk}
          >
            <ChevronUp aria-hidden="true" />
          </ToolIconButton>
          <ToolIconButton
            label={t("repo.diffNextChange")}
            disabled={!canNavigateHunk}
            onClick={goNextHunk}
          >
            <ChevronDown aria-hidden="true" />
          </ToolIconButton>

          <div className="bg-border mx-0.5 h-4 w-px shrink-0" aria-hidden="true" />

          <ToolIconButton
            label={t("repo.diffInline")}
            pressed={sideBySide === false}
            disabled={diffToolsDisabled}
            onClick={() => setDiffLayout("inline")}
          >
            <List aria-hidden="true" />
          </ToolIconButton>
          <ToolIconButton
            label={t("repo.diffSideBySide")}
            pressed={sideBySide}
            disabled={diffToolsDisabled}
            onClick={() => setDiffLayout("sideBySide")}
          >
            <Columns2 aria-hidden="true" />
          </ToolIconButton>
          <ToolIconButton
            label={t("repo.diffFoldUnchanged")}
            pressed={foldUnchanged}
            disabled={diffToolsDisabled}
            onClick={() => setFoldUnchanged((prev) => !prev)}
          >
            <FoldVertical aria-hidden="true" />
          </ToolIconButton>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-6 px-2 text-[11px]"
            disabled
            title={t("repo.diffComingSoon")}
            onClick={handleComingSoon}
          >
            {t("repo.diffBlame")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-6 px-2 text-[11px]"
            disabled
            title={t("repo.diffComingSoon")}
            onClick={handleComingSoon}
          >
            {t("repo.diffHistory")}
          </Button>
          <ToolIconButton label={t("repo.diffMore")} onClick={handleComingSoon}>
            <Menu aria-hidden="true" />
          </ToolIconButton>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          {t("common.loading")}
        </div>
      ) : null}

      {!loading && error ? (
        <div className="text-destructive flex flex-1 items-center justify-center px-4 text-center text-sm">
          {error}
        </div>
      ) : null}

      {!loading && !error && diff?.binary ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center px-4 text-center text-sm">
          {t("repo.diffBinary")}
        </div>
      ) : null}

      {!loading && !error && diff && !diff.binary ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {diff.truncated ? (
            <p className="bg-muted/80 text-muted-foreground shrink-0 border-b px-3 py-1 text-[11px]">
              {t("repo.diffTruncated")}
            </p>
          ) : null}

          {mode === "diff" ? (
            <>
              {sideBySide ? (
                <div className="border-border text-muted-foreground grid shrink-0 grid-cols-2 border-b text-[11px]">
                  <div className="border-border flex items-center justify-between gap-2 border-r px-3 py-1">
                    <span className="truncate">{baseLabel}</span>
                    <span
                      className="shrink-0 tabular-nums opacity-70"
                      title={t("repo.diffLineEnding")}
                    >
                      {baseEol}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-1">
                    <span className="truncate">{localLabel}</span>
                    <span
                      className="shrink-0 tabular-nums opacity-70"
                      title={t("repo.diffLineEnding")}
                    >
                      {localEol}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="border-border text-muted-foreground flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1 text-[11px]">
                  <span className="truncate">{localLabel}</span>
                  <span
                    className="shrink-0 tabular-nums opacity-70"
                    title={t("repo.diffLineEnding")}
                  >
                    {localEol}
                  </span>
                </div>
              )}
              <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                  <div ref={setHost} className="jlgit-monaco-host">
                    {ready ? (
                      <DiffEditor
                        key={editorKey}
                        width={size.width}
                        height={size.height}
                        original={diff.oldText}
                        modified={diff.newText}
                        language={language}
                        theme={monacoTheme}
                        beforeMount={handleBeforeMount}
                        onMount={(editor, monaco) => {
                          handleDiffMount(editor, monaco);
                          editor.updateOptions({
                            renderSideBySide: sideBySide,
                            renderSideBySideInlineBreakpoint: sideBySide
                              ? 0
                              : 10_000,
                            useInlineViewWhenSpaceIsLimited: !sideBySide,
                            hideUnchangedRegions: {
                              enabled: foldUnchanged,
                              revealLineCount: 1,
                              minimumLineCount: 3,
                              contextLineCount: 3,
                            },
                          } as Parameters<typeof editor.updateOptions>[0]);
                        }}
                        options={{
                          ...monacoCommonOptions,
                          minimap: { enabled: false },
                          renderOverviewRuler: false,
                          fontFamily,
                          renderSideBySide: sideBySide,
                          originalEditable: false,
                          renderIndicators: true,
                          enableSplitViewResizing: sideBySide,
                          // Monaco 运行时支持；当前 @monaco-editor/react 类型未收录
                          hideUnchangedRegions: {
                            enabled: foldUnchanged,
                            revealLineCount: 1,
                            minimumLineCount: 3,
                            contextLineCount: 3,
                          },
                        } as ComponentProps<typeof DiffEditor>["options"]}
                        loading={
                          <div className="bg-background text-muted-foreground flex h-full items-center justify-center text-sm">
                            {t("common.loading")}
                          </div>
                        }
                      />
                    ) : null}
                  </div>
                </div>
                {/* 仅最右侧：本地修改侧代码预览图 */}
                <DiffSidePreview
                  changes={previewChanges}
                  viewport={previewViewport}
                  dark={dark}
                  onJumpRatio={(ratio) => {
                    const modified =
                      diffEditorRef.current?.getModifiedEditor();
                    if (!modified) {
                      return;
                    }
                    const maxScroll = Math.max(
                      0,
                      modified.getScrollHeight() - modified.getLayoutInfo().height,
                    );
                    modified.setScrollTop(ratio * maxScroll);
                    modified.focus();
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                <div ref={setHost} className="jlgit-monaco-host">
                  {ready ? (
                    <Editor
                      key={editorKey}
                      width={size.width}
                      height={size.height}
                      value={diff.newText}
                      language={language}
                      theme={monacoTheme}
                      beforeMount={handleBeforeMount}
                      onMount={handleFileMount}
                      options={{
                        ...monacoCommonOptions,
                        fontFamily,
                      }}
                      loading={
                        <div className="bg-background text-muted-foreground flex h-full items-center justify-center text-sm">
                          {t("common.loading")}
                        </div>
                      }
                    />
                  ) : null}
                </div>
              </div>
              <CodeSidePreview
                text={diff.newText}
                viewport={previewViewport}
                dark={dark}
                onJumpRatio={(ratio) => {
                  const editor = fileEditorRef.current;
                  if (!editor) {
                    return;
                  }
                  const maxScroll = Math.max(
                    0,
                    editor.getScrollHeight() - editor.getLayoutInfo().height,
                  );
                  editor.setScrollTop(ratio * maxScroll);
                  editor.focus();
                }}
              />
            </div>
          )}
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}
