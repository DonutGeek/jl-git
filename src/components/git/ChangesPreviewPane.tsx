import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import {
  DiffEditor,
  Editor,
  type DiffOnMount,
  type Monaco,
  type OnMount,
} from "@monaco-editor/react";
import {
  Eye,
  EyeOff,
  FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CodeSidePreview } from "@/components/git/CodeSidePreview";
import { CopyablePathLabel } from "@/components/git/CopyablePathLabel";
import { DiffSidePreview, type DiffPreviewChange } from "@/components/git/DiffSidePreview";
import {
  DiffPreviewToolbar,
  type DiffPreviewLayout,
  type DiffPreviewMode,
} from "@/components/git/DiffPreviewToolbar";
import {
  bindDiffScrollSync,
  detectLineEnding,
  isDocumentDark,
  languageFromPath,
  monacoCommonOptions,
  navigateDiffHunk,
  readMonoFont,
  revealFirstDiffHunk,
  useMonacoHostSize,
} from "@/components/git/monacoPreviewShared";
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
import {
  gitStatusLetterClass,
  normalizeGitStatusLetter,
} from "@/utils/gitStatusStyle";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

/** 稳定空数组：避免 selector 每次返回新 [] */
const EMPTY_ENTRIES: GitStatusEntry[] = [];

/** 变更主区右侧：文件视图 / 差异视图（Monaco） */
export function ChangesPreviewPane() {
  const { t } = useTranslation();
  const repoPath = useRepoStore((state) => state.repoPath);
  const selectedChange = useRepoStore((state) => state.selectedChange);
  const entries = useRepoStore((state) => state.status?.entries ?? EMPTY_ENTRIES);

  const [mode, setMode] = useState<DiffPreviewMode>("diff");
  const [diffLayout, setDiffLayout] = useState<DiffPreviewLayout>("sideBySide");
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
  const revealedSelectionRef = useRef<string | null>(null);
  const { setHost, size } = useMonacoHostSize(`${mode}:${diffLayout}`);
  const [previewChanges, setPreviewChanges] = useState<DiffPreviewChange[]>([]);
  const [previewViewport, setPreviewViewport] = useState<{
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  } | null>(null);
  const selectionKey = selectedChange
    ? `${selectedChange.side}:${selectedChange.path}`
    : null;

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
      if (
        selectionKey &&
        lineChanges.length > 0 &&
        revealedSelectionRef.current !== selectionKey
      ) {
        revealFirstDiffHunk(editor);
        revealedSelectionRef.current = selectionKey;
      }
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
    revealedSelectionRef.current = null;
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
          <TooltipContent align="center">
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
        <CopyablePathLabel
          path={selectedChange.path}
          className="hover:text-foreground"
        />
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
      {/* 工具行：与历史提交对比共用 DiffPreviewToolbar */}
      <DiffPreviewToolbar
        encoding={encoding}
        onEncodingChange={setEncoding}
        mode={mode}
        onModeChange={setMode}
        canNavigateHunk={canNavigateHunk}
        onPrevHunk={goPrevHunk}
        onNextHunk={goNextHunk}
        diffLayout={diffLayout}
        onDiffLayoutChange={setDiffLayout}
        foldUnchanged={foldUnchanged}
        onFoldUnchangedChange={setFoldUnchanged}
        diffToolsDisabled={diffToolsDisabled}
      />

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
