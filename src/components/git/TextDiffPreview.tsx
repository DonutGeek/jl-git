import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
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

import { CodeSidePreview } from "@/components/git/CodeSidePreview";
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
import {
  applyJlGitMonacoTheme,
  forceMonacoThemeRepaint,
  getJlGitMonacoThemeName,
} from "@/design/monaco.theme";
import type { GitDiffResult } from "@/types/git";

export interface TextDiffPreviewProps {
  path: string;
  diff: GitDiffResult;
  /** 切换文件/版本时变化，用于只自动定位一次首个差异 */
  selectionKey: string;
  encoding: string;
  onEncodingChange: (encoding: string) => void;
  oldLabel: ReactNode;
  newLabel: ReactNode;
  /** 二进制时编码下拉展示文案（默认 "—"） */
  binaryEncodingLabel?: string;
  /**
   * 为 true 时二进制也走 DiffEditor（如分支比较 HEX）。
   * 默认 false：显示「无法以文本预览」提示。
   */
  allowBinaryEditor?: boolean;
  className?: string;
}

/**
 * 只读文本 Diff 预览：工具栏 + Monaco + 右侧变更预览条。
 * 供工作区变更、历史提交对比、分支比较复用。
 */
export function TextDiffPreview({
  path,
  diff,
  selectionKey,
  encoding,
  onEncodingChange,
  oldLabel,
  newLabel,
  binaryEncodingLabel = "—",
  allowBinaryEditor = false,
  className,
}: TextDiffPreviewProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<DiffPreviewMode>("diff");
  const [diffLayout, setDiffLayout] = useState<DiffPreviewLayout>("sideBySide");
  const [foldUnchanged, setFoldUnchanged] = useState(false);
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

  const showEditor = !diff.binary || allowBinaryEditor;
  const sideBySide = diffLayout === "sideBySide";
  const language = diff.binary ? "plaintext" : languageFromPath(path);
  const fontFamily = readMonoFont();
  const monacoTheme = getJlGitMonacoThemeName(dark);
  const editorKey = `${selectionKey}:${mode}:${diffLayout}:${foldUnchanged ? "fold" : "full"}`;
  const ready = size.width > 0 && size.height > 0;
  const baseEol = diff.binary ? "HEX" : detectLineEnding(diff.oldText);
  const localEol = diff.binary ? "HEX" : detectLineEnding(diff.newText);
  const canNavigateHunk = mode === "diff" && showEditor && !diff.binary;

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

  function jumpFile(ratio: number): void {
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
  }

  return (
    <div className={className ?? "flex h-full min-h-0 min-w-0 flex-col overflow-hidden"}>
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
      />

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
                        options={
                          {
                            ...monacoCommonOptions,
                            minimap: { enabled: false },
                            renderOverviewRuler: false,
                            fontFamily,
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
                          <div className="bg-background text-muted-foreground flex h-full items-center justify-center text-sm">
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
                onJumpRatio={jumpFile}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
