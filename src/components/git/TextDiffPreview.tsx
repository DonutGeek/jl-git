import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import {
  DiffEditor,
  Editor,
  type DiffOnMount,
  type Monaco,
  type OnMount,
} from "@monaco-editor/react";
import { toast } from "sonner";

type MonacoCodeEditor = Parameters<OnMount>[0];
type MonacoDecoration = Parameters<MonacoCodeEditor["deltaDecorations"]>[1][number];

import { DiffSidePreview, type DiffPreviewChange } from "@/components/git/DiffSidePreview";
import {
  DiffPreviewToolbar,
  type DiffPreviewLayout,
  type DiffPreviewMode,
} from "@/components/git/DiffPreviewToolbar";
import { Spinner } from "@/components/ui/spinner";
import {
  bindDiffScrollSync,
  detectLineEnding,
  isDocumentDark,
  languageFromPath,
  monacoCommonOptions,
  monacoFileMinimapOptions,
  navigateDiffHunk,
  readMonoFont,
  readSansFont,
  revealFirstDiffHunk,
  useMonacoHostSize,
} from "@/components/git/monacoPreviewShared";
import {
  applyJlGitMonacoTheme,
  forceMonacoThemeRepaint,
  getJlGitMonacoThemeName,
} from "@/design/monaco.theme";
import { gitService } from "@/services/git";
import { toUserMessage } from "@/types/error";
import type { GitBlameLine, GitDiffResult } from "@/types/git";
import {
  patchDiffViewPrefs,
  readDiffViewPrefs,
  type DiffViewPrefs,
} from "@/utils/diffViewPrefs";

export interface TextDiffPreviewProps {
  path: string;
  diff: GitDiffResult;
  /** 切换文件/版本时变化，用于只自动定位一次首个差异 */
  selectionKey: string;
  encoding: string;
  onEncodingChange: (encoding: string) => void;
  oldLabel: ReactNode;
  newLabel: ReactNode;
  /** 二进制十六进制视图使用固定展示标签，不支持文本编码切换 */
  binaryEncodingLabel?: string;
  /**
   * 为 true 时二进制也走 DiffEditor（如分支比较 HEX）。
   * 默认 false：显示「无法以文本预览」提示。
   */
  allowBinaryEditor?: boolean;
  /** 为 false 时不渲染顶栏（由外层统一提供工具栏） */
  showToolbar?: boolean;
  /** 受控：差异布局（外层工具栏驱动时传入） */
  diffLayout?: DiffPreviewLayout;
  onDiffLayoutChange?: (layout: DiffPreviewLayout) => void;
  /** 受控：折叠未变更区域 */
  foldUnchanged?: boolean;
  onFoldUnchangedChange?: (fold: boolean) => void;
  /** 打开文件历史子窗 */
  onOpenHistory?: () => void;
  /** 行追溯所需：仓库路径；缺省则禁用行追溯 */
  repoPath?: string | null;
  /** 行追溯 revision；省略则对工作区文件 blame */
  blameRev?: string | null;
  /** 受控「更多」偏好（外层自管工具栏时传入） */
  viewPrefs?: DiffViewPrefs;
  onViewPrefsChange?: (patch: Partial<DiffViewPrefs>) => void;
  className?: string;
}

/** 外层工具栏调用的差异块导航 */
export interface TextDiffPreviewHandle {
  goPrevHunk: () => void;
  goNextHunk: () => void;
  canNavigateHunk: boolean;
}

/**
 * 只读文本 Diff 预览：工具栏 + Monaco + 右侧变更预览条。
 * 供工作区变更、历史提交对比、分支比较复用。
 */
export const TextDiffPreview = forwardRef<TextDiffPreviewHandle, TextDiffPreviewProps>(
function TextDiffPreview(
  {
  path,
  diff,
  selectionKey,
  encoding,
  onEncodingChange,
  oldLabel,
  newLabel,
  binaryEncodingLabel = "—",
  allowBinaryEditor = false,
  showToolbar = true,
  diffLayout: controlledDiffLayout,
  onDiffLayoutChange,
  foldUnchanged: controlledFoldUnchanged,
  onFoldUnchangedChange,
  onOpenHistory,
  repoPath = null,
  blameRev = null,
  viewPrefs: controlledViewPrefs,
  onViewPrefsChange,
  className,
}: TextDiffPreviewProps,
  ref,
) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<DiffPreviewMode>("diff");
  const [innerDiffLayout, setInnerDiffLayout] =
    useState<DiffPreviewLayout>("sideBySide");
  const [innerFoldUnchanged, setInnerFoldUnchanged] = useState(false);
  const [innerViewPrefs, setInnerViewPrefs] = useState<DiffViewPrefs>(readDiffViewPrefs);
  const diffLayout = controlledDiffLayout ?? innerDiffLayout;
  const foldUnchanged = controlledFoldUnchanged ?? innerFoldUnchanged;
  const viewPrefs = controlledViewPrefs ?? innerViewPrefs;

  function setDiffLayout(layout: DiffPreviewLayout): void {
    if (onDiffLayoutChange) {
      onDiffLayoutChange(layout);
      return;
    }
    setInnerDiffLayout(layout);
  }

  function setFoldUnchanged(fold: boolean): void {
    if (onFoldUnchangedChange) {
      onFoldUnchangedChange(fold);
      return;
    }
    setInnerFoldUnchanged(fold);
  }

  function handleViewPrefsChange(patch: Partial<DiffViewPrefs>): void {
    if (onViewPrefsChange) {
      onViewPrefsChange(patch);
      return;
    }
    setInnerViewPrefs((prev) => patchDiffViewPrefs(prev, patch));
  }

  const [dark, setDark] = useState(isDocumentDark);
  const monacoRef = useRef<Monaco | null>(null);
  const diffEditorRef = useRef<Parameters<DiffOnMount>[0] | null>(null);
  const fileEditorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const scrollSyncDisposeRef = useRef<(() => void) | null>(null);
  const previewDisposeRef = useRef<(() => void) | null>(null);
  const blameDecorationsRef = useRef<string[]>([]);
  const revealedSelectionRef = useRef<string | null>(null);
  const { setHost, size } = useMonacoHostSize(`${mode}:${diffLayout}`);
  const [previewChanges, setPreviewChanges] = useState<DiffPreviewChange[]>([]);
  const [previewViewport, setPreviewViewport] = useState<{
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  } | null>(null);
  const [blameLines, setBlameLines] = useState<GitBlameLine[]>([]);

  const showEditor = !diff.binary || allowBinaryEditor;
  const sideBySide = diffLayout === "sideBySide";
  const language = diff.binary ? "plaintext" : languageFromPath(path);
  const fontFamily = viewPrefs.monospace ? readMonoFont() : readSansFont();
  const monacoTheme = getJlGitMonacoThemeName(dark);
  const editorKey = `${selectionKey}:${mode}:${diffLayout}:${foldUnchanged ? "fold" : "full"}`;
  const ready = size.width > 0 && size.height > 0;
  const baseEol = diff.binary ? "HEX" : detectLineEnding(diff.oldText);
  const localEol = diff.binary ? "HEX" : detectLineEnding(diff.newText);
  const canNavigateHunk = mode === "diff" && showEditor && !diff.binary;
  const lineBlameDisabled = !repoPath || diff.binary;

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
    const sync = (): void => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

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

  useEffect(() => {
    setPreviewChanges([]);
    setPreviewViewport(null);
    revealedSelectionRef.current = null;
  }, [selectionKey]);

  function handleBeforeMount(monaco: Monaco): void {
    monacoRef.current = monaco;
    applyJlGitMonacoTheme(monaco);
  }

  const handleDiffMount: DiffOnMount = (editor, monaco) => {
    diffEditorRef.current = editor;
    if (size.width > 0 && size.height > 0) {
      editor.layout({ width: size.width, height: size.height });
    }

    editor.getOriginalEditor().updateOptions({ minimap: { enabled: false } });
    editor.getModifiedEditor().updateOptions({ minimap: { enabled: false } });

    scrollSyncDisposeRef.current?.();
    scrollSyncDisposeRef.current = null;
    if (sideBySide) {
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
    // 文件视图用原生 minimap，无需再同步自定义侧栏视口
    previewDisposeRef.current?.();
    previewDisposeRef.current = null;
  };

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

  useImperativeHandle(
    ref,
    () => ({
      goPrevHunk,
      goNextHunk,
      canNavigateHunk,
    }),
    [canNavigateHunk],
  );

  function jumpModified(ratio: number): void {
    const modified = diffEditorRef.current?.getModifiedEditor();
    if (!modified) {
      return;
    }
    const maxScroll = Math.max(
      0,
      modified.getScrollHeight() - modified.getLayoutInfo().height,
    );
    modified.setScrollTop(ratio * maxScroll);
    modified.focus();
  }

  // 同步「更多」偏好到已挂载的 Monaco 实例
  useEffect(() => {
    const wrap = viewPrefs.wordWrap ? "on" : "off";
    const font = viewPrefs.monospace ? readMonoFont() : readSansFont();
    const diffEditor = diffEditorRef.current;
    if (diffEditor) {
      diffEditor.updateOptions({
        ignoreTrimWhitespace: viewPrefs.ignoreWhitespace,
        renderSideBySide: sideBySide,
        diffWordWrap: wrap,
      } as Parameters<typeof diffEditor.updateOptions>[0]);
      diffEditor.getOriginalEditor().updateOptions({ wordWrap: wrap, fontFamily: font });
      diffEditor.getModifiedEditor().updateOptions({ wordWrap: wrap, fontFamily: font });
    }
    fileEditorRef.current?.updateOptions({ wordWrap: wrap, fontFamily: font });
  }, [
    sideBySide,
    viewPrefs.ignoreWhitespace,
    viewPrefs.monospace,
    viewPrefs.wordWrap,
  ]);

  // 行追溯：按需拉取 blame 并装饰「新侧 / 文件视图」
  useEffect(() => {
    if (!viewPrefs.lineBlame || !repoPath || diff.binary) {
      setBlameLines([]);
      return;
    }
    let cancelled = false;
    void gitService
      .getBlame(repoPath, path, blameRev ?? undefined)
      .then((result) => {
        if (!cancelled) setBlameLines(result.lines);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBlameLines([]);
        toast.error(toUserMessage(error) || t("repo.diffLineBlameFailed"));
        handleViewPrefsChange({ lineBlame: false });
      });
    return () => {
      cancelled = true;
    };
    // handleViewPrefsChange 稳定度不足，仅依赖关键输入
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意不跟 patch 函数
  }, [blameRev, diff.binary, path, repoPath, t, viewPrefs.lineBlame]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const target: MonacoCodeEditor | null =
      mode === "diff"
        ? (diffEditorRef.current?.getModifiedEditor() ?? null)
        : fileEditorRef.current;
    if (!monaco || !target) {
      return;
    }
    if (!viewPrefs.lineBlame || blameLines.length === 0) {
      blameDecorationsRef.current = target.deltaDecorations(
        blameDecorationsRef.current,
        [],
      );
      return;
    }
    const decorations: MonacoDecoration[] = blameLines.map((line) => ({
      range: new monaco.Range(line.line, 1, line.line, 1),
      options: {
        isWholeLine: true,
        linesDecorationsClassName: "jlgit-blame-gutter",
        hoverMessage: {
          value: t("repo.diffBlameHover", {
            author: line.authorName,
            hash: line.shortId,
            time: line.authoredAt
              ? dayjs(line.authoredAt).format("YYYY-MM-DD HH:mm")
              : "—",
          }),
        },
      },
    }));
    blameDecorationsRef.current = target.deltaDecorations(
      blameDecorationsRef.current,
      decorations,
    );
  }, [blameLines, mode, ready, t, viewPrefs.lineBlame, editorKey]);

  return (
    <div className={className ?? "flex h-full min-h-0 min-w-0 flex-col overflow-hidden"}>
      {showToolbar ? (
        <DiffPreviewToolbar
          encoding={encoding}
          onEncodingChange={onEncodingChange}
          encodingDisabled={diff.binary}
          encodingDisplayLabel={diff.binary ? binaryEncodingLabel : undefined}
          mode={mode}
          onModeChange={setMode}
          canNavigateHunk={canNavigateHunk}
          onPrevHunk={goPrevHunk}
          onNextHunk={goNextHunk}
          diffLayout={diffLayout}
          onDiffLayoutChange={setDiffLayout}
          foldUnchanged={foldUnchanged}
          onFoldUnchangedChange={setFoldUnchanged}
          diffToolsDisabled={mode !== "diff" || (diff.binary && !allowBinaryEditor)}
          onOpenHistory={onOpenHistory}
          viewPrefs={viewPrefs}
          onViewPrefsChange={handleViewPrefsChange}
          lineBlameDisabled={lineBlameDisabled}
        />
      ) : null}

      {!showEditor ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center px-4 text-center text-sm">
          {t("repo.diffBinary")}
        </div>
      ) : (
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
                    <div className="min-w-0 flex-1 overflow-hidden">{oldLabel}</div>
                    <span
                      className="shrink-0 tabular-nums opacity-70"
                      title={t("repo.diffLineEnding")}
                    >
                      {baseEol}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-1">
                    <div className="min-w-0 flex-1 overflow-hidden">{newLabel}</div>
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
                  <div className="min-w-0 flex-1 overflow-hidden">{newLabel}</div>
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
                          const wrap = viewPrefs.wordWrap ? "on" : "off";
                          editor.updateOptions({
                            renderSideBySide: sideBySide,
                            renderSideBySideInlineBreakpoint: sideBySide
                              ? 0
                              : 10_000,
                            useInlineViewWhenSpaceIsLimited: !sideBySide,
                            ignoreTrimWhitespace: viewPrefs.ignoreWhitespace,
                            diffWordWrap: wrap,
                            hideUnchangedRegions: {
                              enabled: foldUnchanged,
                              revealLineCount: 1,
                              minimumLineCount: 3,
                              contextLineCount: 3,
                            },
                          } as Parameters<typeof editor.updateOptions>[0]);
                          editor.getOriginalEditor().updateOptions({
                            wordWrap: wrap,
                            fontFamily,
                          });
                          editor.getModifiedEditor().updateOptions({
                            wordWrap: wrap,
                            fontFamily,
                          });
                        }}
                        options={
                          {
                            ...monacoCommonOptions,
                            minimap: { enabled: false },
                            renderOverviewRuler: false,
                            fontFamily,
                            wordWrap: viewPrefs.wordWrap ? "on" : "off",
                            ignoreTrimWhitespace: viewPrefs.ignoreWhitespace,
                            diffWordWrap: viewPrefs.wordWrap ? "on" : "off",
                            renderSideBySide: sideBySide,
                            originalEditable: false,
                            renderIndicators: true,
                            enableSplitViewResizing: sideBySide,
                            hideUnchangedRegions: {
                              enabled: foldUnchanged,
                              revealLineCount: 1,
                              minimumLineCount: 3,
                              contextLineCount: 3,
                            },
                          } as ComponentProps<typeof DiffEditor>["options"]
                        }
                        loading={
                          <div className="bg-background text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                            <Spinner className="size-4" />
                            {t("common.loading")}
                          </div>
                        }
                      />
                    ) : null}
                  </div>
                </div>
                <DiffSidePreview
                  changes={previewChanges}
                  viewport={previewViewport}
                  dark={dark}
                  onJumpRatio={jumpModified}
                />
              </div>
            </>
          ) : (
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
                      wordWrap: viewPrefs.wordWrap ? "on" : "off",
                      minimap: monacoFileMinimapOptions,
                    }}
                    loading={
                      <div className="bg-background text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                        <Spinner className="size-4" />
                        {t("common.loading")}
                      </div>
                    }
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
