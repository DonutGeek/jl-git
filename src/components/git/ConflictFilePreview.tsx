import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Editor, type Monaco, type OnMount } from "@monaco-editor/react";
import { toast } from "sonner";

type MonacoDecoration = Parameters<
  Parameters<OnMount>[0]["deltaDecorations"]
>[1][number];

import {
  buildConflictDecorations,
  CONFLICT_ACTIONS_ZONE_HEIGHT,
  createConflictActionsOverlay,
  createConflictMarkerLabelWidgets,
  type ConflictActionsOverlay,
} from "@/components/git/conflictPreviewDom";
import {
  DiffPreviewToolbar,
  type DiffPreviewLayout,
  type DiffPreviewMode,
} from "@/components/git/DiffPreviewToolbar";
import {
  isDocumentDark,
  languageFromPath,
  monacoCommonOptions,
  monacoFileMinimapOptions,
  readMonoFont,
  readSansFont,
  useMonacoHostSize,
} from "@/components/git/monacoPreviewShared";
import {
  TextDiffPreview,
  type TextDiffPreviewHandle,
} from "@/components/git/TextDiffPreview";
import {
  applyJlGitMonacoTheme,
  forceMonacoThemeRepaint,
  getJlGitMonacoThemeName,
} from "@/design/monaco.theme";
import { gitService } from "@/services/git";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";
import type { GitBlameLine, GitDiffResult } from "@/types/git";
import {
  patchDiffViewPrefs,
  readDiffViewPrefs,
  type DiffViewPrefs,
} from "@/utils/diffViewPrefs";
import {
  applyConflictHunkAction,
  hasConflictMarkers,
  parseConflictHunks,
  type ConflictHunkAction,
} from "@/utils/gitConflict";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

interface ConflictFilePreviewProps {
  filePath: string;
  encoding?: string;
  onEncodingChange?: (encoding: string) => void;
  /** 整文件操作忙碌态变化（供预览顶栏按钮禁用） */
  onBusyChange?: (busy: boolean) => void;
}

/** 供预览顶栏调用的整文件冲突操作 */
export interface ConflictFilePreviewHandle {
  take: (side: "ours" | "theirs") => Promise<void>;
  markResolved: () => Promise<void>;
}

/** 冲突文件预览：对比工具栏 + 文件视图冲突块 / 差异视图 */
export const ConflictFilePreview = forwardRef<
  ConflictFilePreviewHandle,
  ConflictFilePreviewProps
>(function ConflictFilePreview(
  {
    filePath,
    encoding = DEFAULT_TEXT_ENCODING,
    onEncodingChange,
    onBusyChange,
  },
  ref,
) {
  const { t } = useTranslation();
  const repoPath = useRepoStore((state) => state.repoPath);
  const repoState = useRepoStore((state) => state.repoState);
  const refreshStatus = useRepoStore((state) => state.refreshStatus);
  const selectChange = useRepoStore((state) => state.selectChange);

  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hunkIndex, setHunkIndex] = useState(0);
  const [dark, setDark] = useState(isDocumentDark);
  const [mode, setMode] = useState<DiffPreviewMode>("file");
  const [diffLayout, setDiffLayout] = useState<DiffPreviewLayout>("sideBySide");
  const [foldUnchanged, setFoldUnchanged] = useState(false);
  const [viewPrefs, setViewPrefs] = useState<DiffViewPrefs>(readDiffViewPrefs);
  const [blameLines, setBlameLines] = useState<GitBlameLine[]>([]);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  /** 编辑器挂载后递增，确保首屏能滚到第一处冲突 */
  const [editorEpoch, setEditorEpoch] = useState(0);
  const conflictFocusEpoch = useRepoStore((state) => state.conflictFocusEpoch);
  const textDiffRef = useRef<TextDiffPreviewHandle | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const blameDecorationsRef = useRef<string[]>([]);
  const decoRef = useRef<string[]>([]);
  const zoneIdsRef = useRef<string[]>([]);
  const overlaysRef = useRef<ConflictActionsOverlay[]>([]);
  const labelWidgetsRef = useRef<
    Parameters<Parameters<OnMount>[0]["addContentWidget"]>[0][]
  >([]);
  const layoutDispRef = useRef<{ dispose: () => void } | null>(null);
  const hunkActionRef = useRef<
    (index: number, action: ConflictHunkAction) => void
  >(() => undefined);
  const busyRef = useRef(busy);
  const hunkIndexRef = useRef(hunkIndex);
  const { setHost, size } = useMonacoHostSize(`conflict:${filePath}`);

  const hunks = useMemo(() => (text ? parseConflictHunks(text) : []), [text]);
  const activeHunk = hunks[hunkIndex] ?? null;
  const oursLabel = repoState?.oursLabel || t("repo.conflictOursFallback");
  const theirsLabel = repoState?.theirsLabel || t("repo.conflictTheirsFallback");

  busyRef.current = busy;
  hunkIndexRef.current = hunkIndex;

  useEffect(() => {
    onBusyChange?.(busy || loading);
  }, [busy, loading, onBusyChange]);

  useEffect(() => {
    const root = document.documentElement;
    const sync = (): void => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!repoPath) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void gitService
      .readWorktreeFile(repoPath, filePath, { encoding })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.binary) {
          setError(t("repo.conflictBinary"));
          setText(null);
        } else {
          setText(result.text);
          setHunkIndex(0);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(toUserMessage(loadError));
          setText(null);
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
  }, [encoding, filePath, repoPath, t]);

  // 差异视图：懒加载 worktree diff
  useEffect(() => {
    if (mode !== "diff" || !repoPath) {
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    setDiffError(null);
    void gitService
      .getDiff(repoPath, {
        filePath,
        staged: false,
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
          setDiffError(toUserMessage(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDiffLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [encoding, filePath, mode, repoPath]);

  // 选中冲突文件 / 外部聚焦：始终从第一处冲突开始
  useEffect(() => {
    setHunkIndex(0);
    setMode("file");
  }, [conflictFocusEpoch, filePath]);

  useEffect(() => {
    if (hunkIndex >= hunks.length) {
      setHunkIndex(Math.max(0, hunks.length - 1));
    }
  }, [hunkIndex, hunks.length]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !text) {
      return;
    }

    const model = editor.getModel();
    const markerLabels = {
      oursKind: t("repo.conflictMarkerOurs"),
      theirsKind: t("repo.conflictMarkerTheirs"),
      oursMeta: repoState?.oursMeta ?? {
        label: oursLabel,
      },
      theirsMeta: repoState?.theirsMeta ?? {
        label: theirsLabel,
      },
      oursLocalSuffix: t("repo.conflictMarkerLocalSuffix"),
    };
    decoRef.current = editor.deltaDecorations(
      decoRef.current,
      buildConflictDecorations(monaco, hunks),
    );

    // 清理旧行尾元数据 / 操作条
    for (const widget of labelWidgetsRef.current) {
      editor.removeContentWidget(widget);
    }
    labelWidgetsRef.current = [];
    for (const overlay of overlaysRef.current) {
      editor.removeOverlayWidget(overlay.widget);
    }
    overlaysRef.current = [];
    layoutDispRef.current?.dispose();
    layoutDispRef.current = null;

    const labelWidgets = createConflictMarkerLabelWidgets(
      monaco,
      editor,
      hunks,
      model,
      markerLabels,
      `jlgit.conflict.label.${filePath}`,
    );
    for (const widget of labelWidgets) {
      editor.addContentWidget(widget);
    }
    labelWidgetsRef.current = labelWidgets;

    // View Zone 占位 + Overlay Widget 可点按钮（zone 在文本层下，点不到）
    editor.changeViewZones((accessor) => {
      for (const zoneId of zoneIdsRef.current) {
        accessor.removeZone(zoneId);
      }
      zoneIdsRef.current = [];

      hunks.forEach((hunk, index) => {
        const overlay = createConflictActionsOverlay({
          editor,
          id: `jlgit.conflict.actions.${filePath}.${hunk.startLine}.${index}`,
          labels: {
            ours: t("repo.conflictAcceptOurs"),
            theirs: t("repo.conflictAcceptTheirs"),
            both: t("repo.conflictAcceptBoth"),
          },
          disabled: busyRef.current,
          active: index === hunkIndexRef.current,
          onAction: (action) => {
            hunkActionRef.current(index, action);
          },
        });

        const zoneId = accessor.addZone({
          afterLineNumber: hunk.startLine - 1,
          heightInPx: CONFLICT_ACTIONS_ZONE_HEIGHT,
          domNode: overlay.spacer,
          suppressMouseDown: true,
          onDomNodeTop: overlay.onDomNodeTop,
          onComputedHeight: overlay.onComputedHeight,
        });
        zoneIdsRef.current.push(zoneId);
        editor.addOverlayWidget(overlay.widget);
        overlaysRef.current.push({
          ...overlay,
          zoneId,
        });
        overlay.layout();
      });
    });

    layoutDispRef.current = editor.onDidLayoutChange(() => {
      for (const entry of overlaysRef.current) {
        entry.layout();
      }
    });

    if (!activeHunk) {
      return;
    }
    const line = activeHunk.startLine;
    // 等布局与 view zone 落稳后再滚，避免仍停在文件顶部
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: 1 });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    activeHunk,
    editorEpoch,
    filePath,
    hunkIndex,
    hunks,
    oursLabel,
    repoState?.oursMeta,
    repoState?.theirsMeta,
    t,
    text,
    theirsLabel,
  ]);

  useEffect(() => {
    // busy / 当前块变化时同步，无需重建 zone + widget
    overlaysRef.current.forEach((overlay, index) => {
      overlay.setBusy(busy);
      overlay.setActive(index === hunkIndex);
    });
  }, [busy, hunkIndex]);

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
        forceMonacoThemeRepaint(null, editorRef.current);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [dark]);

  useEffect(() => {
    if (size.width > 0 && size.height > 0) {
      editorRef.current?.layout({ width: size.width, height: size.height });
    }
  }, [size]);

  useEffect(() => {
    return () => {
      const editor = editorRef.current;
      layoutDispRef.current?.dispose();
      layoutDispRef.current = null;
      if (!editor) {
        return;
      }
      for (const widget of labelWidgetsRef.current) {
        editor.removeContentWidget(widget);
      }
      labelWidgetsRef.current = [];
      for (const overlay of overlaysRef.current) {
        editor.removeOverlayWidget(overlay.widget);
      }
      overlaysRef.current = [];
      editor.changeViewZones((accessor) => {
        for (const zoneId of zoneIdsRef.current) {
          accessor.removeZone(zoneId);
        }
        zoneIdsRef.current = [];
      });
    };
  }, []);

  async function reloadAfterResolve(): Promise<void> {
    await refreshStatus();
    const nextState = await useRepoStore.getState().refreshRepoState();
    const remaining = nextState?.conflictPaths ?? [];
    if (remaining.length === 0) {
      toast.success(t("repo.conflictAllResolved"));
      return;
    }
    const nextPath = remaining.find((path) => path !== filePath) ?? remaining[0];
    if (nextPath && nextPath !== filePath) {
      selectChange({ path: nextPath, side: "index" });
      return;
    }
    // 同文件仍有冲突：重新读盘
    if (!repoPath) {
      return;
    }
    const result = await gitService.readWorktreeFile(repoPath, filePath, {
      encoding,
    });
    setText(result.text);
    setHunkIndex(0);
  }

  async function handleTake(side: "ours" | "theirs"): Promise<void> {
    if (!repoPath || busy) {
      return;
    }
    setBusy(true);
    try {
      await gitService.conflictTake(repoPath, filePath, side);
      toast.success(
        side === "ours"
          ? t("repo.conflictTookOurs", { branch: oursLabel })
          : t("repo.conflictTookTheirs", { branch: theirsLabel }),
      );
      await reloadAfterResolve();
    } catch (takeError) {
      toast.error(toUserMessage(takeError));
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkResolved(): Promise<void> {
    if (!repoPath || busy || text == null) {
      return;
    }
    if (hasConflictMarkers(text)) {
      toast.error(t("repo.conflictStillHasMarkers"));
      return;
    }
    setBusy(true);
    try {
      await gitService.conflictMarkResolved(repoPath, filePath);
      toast.success(t("repo.conflictMarkedResolved"));
      await reloadAfterResolve();
    } catch (markError) {
      toast.error(toUserMessage(markError));
    } finally {
      setBusy(false);
    }
  }

  async function handleHunkAction(
    index: number,
    action: ConflictHunkAction,
  ): Promise<void> {
    if (!repoPath || busy || text == null) {
      return;
    }
    setBusy(true);
    setHunkIndex(index);
    try {
      const nextText = applyConflictHunkAction(text, index, action);
      const remaining = parseConflictHunks(nextText);
      const stage = remaining.length === 0;
      await gitService.writeWorktreeFile(repoPath, filePath, nextText, {
        stage,
        encoding,
      });
      if (stage) {
        toast.success(t("repo.conflictMarkedResolved"));
        await reloadAfterResolve();
      } else {
        setText(nextText);
        setHunkIndex(Math.min(index, remaining.length - 1));
      }
    } catch (actionError) {
      toast.error(toUserMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  hunkActionRef.current = (index, action) => {
    void handleHunkAction(index, action);
  };

  const takeRef = useRef(handleTake);
  const markResolvedRef = useRef(handleMarkResolved);
  takeRef.current = handleTake;
  markResolvedRef.current = handleMarkResolved;

  useImperativeHandle(
    ref,
    () => ({
      take: (side) => takeRef.current(side),
      markResolved: () => markResolvedRef.current(),
    }),
    [],
  );

  function goHunk(delta: number): void {
    if (hunks.length === 0) {
      return;
    }
    setHunkIndex((current) => {
      const next = current + delta;
      if (next < 0) {
        return hunks.length - 1;
      }
      if (next >= hunks.length) {
        return 0;
      }
      return next;
    });
  }

  const ready = size.width > 0 && size.height > 0;
  const conflictNavLabel =
    hunks.length === 0
      ? t("repo.conflictNone")
      : t("repo.conflictIndex", {
          current: hunkIndex + 1,
          total: hunks.length,
        });

  function handleEncodingChange(next: string): void {
    onEncodingChange?.(next);
  }

  function handleViewPrefsChange(patch: Partial<DiffViewPrefs>): void {
    setViewPrefs((prev) => patchDiffViewPrefs(prev, patch));
  }

  const fontFamily = viewPrefs.monospace ? readMonoFont() : readSansFont();
  const lineBlameDisabled = !repoPath;

  // 文件视图：同步换行 / 字体
  useEffect(() => {
    if (mode !== "file") return;
    editorRef.current?.updateOptions({
      wordWrap: viewPrefs.wordWrap ? "on" : "off",
      fontFamily,
    });
  }, [fontFamily, mode, viewPrefs.wordWrap]);

  // 文件视图行追溯
  useEffect(() => {
    if (mode !== "file" || !viewPrefs.lineBlame || !repoPath) {
      setBlameLines([]);
      return;
    }
    let cancelled = false;
    void gitService
      .getBlame(repoPath, filePath)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意不跟 patch 函数
  }, [filePath, mode, repoPath, t, viewPrefs.lineBlame]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (mode !== "file" || !monaco || !editor) {
      return;
    }
    if (!viewPrefs.lineBlame || blameLines.length === 0) {
      blameDecorationsRef.current = editor.deltaDecorations(
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
    blameDecorationsRef.current = editor.deltaDecorations(
      blameDecorationsRef.current,
      decorations,
    );
  }, [blameLines, editorEpoch, mode, t, viewPrefs.lineBlame]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <DiffPreviewToolbar
        encoding={encoding}
        onEncodingChange={handleEncodingChange}
        mode={mode}
        onModeChange={setMode}
        canNavigateHunk={
          mode === "file"
            ? hunks.length > 0 && !busy
            : Boolean(diff && !diff.binary && !diffLoading)
        }
        onPrevHunk={() => {
          if (mode === "file") {
            goHunk(-1);
            return;
          }
          textDiffRef.current?.goPrevHunk();
        }}
        onNextHunk={() => {
          if (mode === "file") {
            goHunk(1);
            return;
          }
          textDiffRef.current?.goNextHunk();
        }}
        navLabel={mode === "file" ? conflictNavLabel : undefined}
        diffLayout={diffLayout}
        onDiffLayoutChange={setDiffLayout}
        foldUnchanged={foldUnchanged}
        onFoldUnchangedChange={setFoldUnchanged}
        diffToolsDisabled={
          mode !== "diff" || diffLoading || Boolean(diff?.binary) || !diff
        }
        hideDiffLayoutTools={mode === "file"}
        viewPrefs={viewPrefs}
        onViewPrefsChange={handleViewPrefsChange}
        lineBlameDisabled={lineBlameDisabled}
      />

      {mode === "diff" ? (
        diffLoading ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            {t("common.loading")}
          </div>
        ) : diffError ? (
          <div className="text-destructive flex flex-1 items-center justify-center px-4 text-center text-sm">
            {diffError}
          </div>
        ) : diff ? (
          <TextDiffPreview
            ref={textDiffRef}
            path={filePath}
            diff={diff}
            selectionKey={`conflict-diff:${filePath}`}
            encoding={encoding}
            onEncodingChange={handleEncodingChange}
            showToolbar={false}
            diffLayout={diffLayout}
            onDiffLayoutChange={setDiffLayout}
            foldUnchanged={foldUnchanged}
            onFoldUnchangedChange={setFoldUnchanged}
            repoPath={repoPath}
            viewPrefs={viewPrefs}
            onViewPrefsChange={handleViewPrefsChange}
            oldLabel={<span className="truncate">{t("repo.diffBaseUnstaged")}</span>}
            newLabel={<span className="truncate">{t("repo.diffLocalUnstaged")}</span>}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          />
        ) : null
      ) : null}

      {mode === "file" && loading ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          {t("common.loading")}
        </div>
      ) : null}
      {mode === "file" && !loading && error ? (
        <div className="text-destructive flex flex-1 items-center justify-center px-4 text-center text-sm">
          {error}
        </div>
      ) : null}
      {mode === "file" && !loading && !error && text != null ? (
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <div ref={setHost} className="jlgit-monaco-host">
            {ready ? (
              <Editor
                width={size.width}
                height={size.height}
                value={text}
                language={languageFromPath(filePath)}
                theme={getJlGitMonacoThemeName(dark)}
                beforeMount={(monaco) => {
                  monacoRef.current = monaco;
                  applyJlGitMonacoTheme(monaco);
                }}
                onMount={(editor) => {
                  editorRef.current = editor;
                  if (size.width > 0 && size.height > 0) {
                    editor.layout({ width: size.width, height: size.height });
                  }
                  setEditorEpoch((value) => value + 1);
                }}
                options={{
                  ...monacoCommonOptions,
                  readOnly: true,
                  fontFamily,
                  wordWrap: viewPrefs.wordWrap ? "on" : "off",
                  minimap: monacoFileMinimapOptions,
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});
