import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import {
  DiffEditor,
  Editor,
  type DiffOnMount,
  type Monaco,
  type OnMount,
} from "@monaco-editor/react";
import { ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import type { GitDiffResult } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import { gitStatusLetterClass, normalizeGitStatusLetter } from "@/utils/gitStatusStyle";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

/** 差异顶栏可复制完整 rev：悬停提示复制，点击写入剪贴板 */
function CopyableDiffRev({ hash }: { hash: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copyHash(): Promise<void> {
    try {
      await copyToClipboard(hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      toast.error(toUserMessage(error) || t("repo.copyFailed"));
    }
  }

  return (
    <Tooltip open={copied ? true : undefined} delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-primary min-w-0 cursor-pointer truncate border-0 border-b border-transparent bg-transparent p-0 pb-px font-mono text-[11px] leading-none hover:border-current"
          aria-label={t("repo.copy")}
          title={hash}
          onClick={() => {
            void copyHash();
          }}
        >
          {hash}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        {copied ? t("repo.copySuccess") : t("repo.copy")}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * 历史详情左侧：点击改动文件后整区切到该文件相对 parent 的前后对比。
 * 工具行与 ChangesPreviewPane 共用 DiffPreviewToolbar。
 */
export function CommitFileDiffPane() {
  const { t } = useTranslation();
  const repoPath = useRepoStore((state) => state.repoPath);
  const selectedCommitFile = useRepoStore((state) => state.selectedCommitFile);
  const selectCommitFile = useRepoStore((state) => state.selectCommitFile);

  const [mode, setMode] = useState<DiffPreviewMode>("diff");
  const [diffLayout, setDiffLayout] = useState<DiffPreviewLayout>("sideBySide");
  const [foldUnchanged, setFoldUnchanged] = useState(false);
  const [encoding, setEncoding] = useState(DEFAULT_TEXT_ENCODING);
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
    const sync = (): void => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // 明暗切换：等 CSS 变量生效后再刷 Monaco + 强制重绘
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
    // 仅多栏时同步左右滚动；单栏内联视图无需双向绑定
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

  // 切换选中文件时复位预览图状态
  useEffect(() => {
    setPreviewChanges([]);
    setPreviewViewport(null);
  }, [
    selectedCommitFile?.commitId,
    selectedCommitFile?.parentId,
    selectedCommitFile?.path,
  ]);

  useEffect(() => {
    if (!repoPath || !selectedCommitFile) {
      setDiff(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void gitService
      .getCommitFileDiff(repoPath, {
        filePath: selectedCommitFile.path,
        commitRev: selectedCommitFile.commitId,
        parentRev: selectedCommitFile.parentId,
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
  }, [repoPath, selectedCommitFile, encoding]);

  if (!selectedCommitFile) {
    return null;
  }

  const language = languageFromPath(selectedCommitFile.path);
  const fontFamily = readMonoFont();
  const statusLetter = normalizeGitStatusLetter(selectedCommitFile.status);
  const filePath = selectedCommitFile.path;

  const parentFullId =
    selectedCommitFile.parentId === "" ? null : selectedCommitFile.parentId;
  const commitFullId = selectedCommitFile.commitId;
  const isRootCommit = selectedCommitFile.parentId === "";

  const editorKey = `${selectedCommitFile.commitId}:${selectedCommitFile.parentId}:${selectedCommitFile.path}:${mode}:${diffLayout}:${foldUnchanged ? "fold" : "full"}`;
  const ready = size.width > 0 && size.height > 0;
  const baseEol = diff ? detectLineEnding(diff.oldText) : "LF";
  const localEol = diff ? detectLineEnding(diff.newText) : "LF";
  const diffToolsDisabled = mode !== "diff";
  const sideBySide = diffLayout === "sideBySide";
  const canNavigateHunk = mode === "diff" && !loading && Boolean(diff) && !diff?.binary;
  const monacoTheme = getJlGitMonacoThemeName(dark);

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
      {/* 顶栏：与右侧 HistoryDetail 顶栏同高 h-11，分隔线对齐 */}
      <div className="border-border flex h-11 shrink-0 items-center gap-1.5 border-b px-2">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 shrink-0 [&_svg]:size-3.5"
              aria-label={t("repo.commitDiffBack")}
              onClick={() => selectCommitFile(null)}
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("repo.commitDiffBack")}</TooltipContent>
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
        {/* 提示相对路径文字居中（非整行弹层宽度） */}
        <CopyablePathLabel path={filePath} />
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 shrink-0 [&_svg]:size-3.5"
              aria-label={t("repo.diffClosePreview")}
              onClick={() => selectCommitFile(null)}
            >
              <X aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("repo.diffClosePreview")}</TooltipContent>
        </Tooltip>
      </div>

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
                <div className="border-border grid shrink-0 grid-cols-2 border-b text-[11px]">
                  <div className="border-border flex items-center justify-between gap-2 border-r px-3 py-1">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      {isRootCommit || !parentFullId ? (
                        <span className="text-foreground truncate font-mono">
                          {t("repo.diffEmptyTree")}
                        </span>
                      ) : (
                        <>
                          <span className="text-muted-foreground shrink-0">
                            {t("repo.diffParentLabel")}
                          </span>
                          <CopyableDiffRev hash={parentFullId} />
                        </>
                      )}
                    </div>
                    <span
                      className="text-muted-foreground shrink-0 tabular-nums opacity-70"
                      title={t("repo.diffLineEnding")}
                    >
                      {baseEol}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-1">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span className="text-muted-foreground shrink-0">
                        {t("repo.diffCommitLabel")}
                      </span>
                      <CopyableDiffRev hash={commitFullId} />
                    </div>
                    <span
                      className="text-muted-foreground shrink-0 tabular-nums opacity-70"
                      title={t("repo.diffLineEnding")}
                    >
                      {localEol}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1 text-[11px]">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span className="text-muted-foreground shrink-0">
                      {t("repo.diffCommitLabel")}
                    </span>
                    <CopyableDiffRev hash={commitFullId} />
                  </div>
                  <span
                    className="text-muted-foreground shrink-0 tabular-nums opacity-70"
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
                  onJumpRatio={(ratio) => {
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
    </div>
  );
}
