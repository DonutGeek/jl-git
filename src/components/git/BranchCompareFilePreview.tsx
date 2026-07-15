import { useEffect, useRef, useState, type ComponentProps } from "react";
import { DiffEditor, Editor, type DiffOnMount, type Monaco } from "@monaco-editor/react";

import {
  DiffPreviewToolbar,
  type DiffPreviewLayout,
  type DiffPreviewMode,
} from "@/components/git/DiffPreviewToolbar";
import {
  detectLineEnding,
  isDocumentDark,
  languageFromPath,
  monacoCommonOptions,
  navigateDiffHunk,
  readMonoFont,
} from "@/components/git/monacoPreviewShared";
import {
  applyJlGitMonacoTheme,
  getJlGitMonacoThemeName,
} from "@/design/monaco.theme";
import type { GitDiffResult } from "@/types/git";

interface BranchCompareFilePreviewProps {
  base: string;
  target: string;
  path: string;
  diff: GitDiffResult;
  encoding: string;
  onEncodingChange: (encoding: string) => void;
}

/** 分支比较文件预览：复用变更页的工具行，所有可见控件均作用于当前只读 Diff。 */
export function BranchCompareFilePreview({
  base,
  target,
  path,
  diff,
  encoding,
  onEncodingChange,
}: BranchCompareFilePreviewProps) {
  const [mode, setMode] = useState<DiffPreviewMode>("diff");
  const [diffLayout, setDiffLayout] = useState<DiffPreviewLayout>("sideBySide");
  const [foldUnchanged, setFoldUnchanged] = useState(false);
  const [dark, setDark] = useState(isDocumentDark);
  const diffEditorRef = useRef<Parameters<DiffOnMount>[0] | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const sync = (): void => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const sideBySide = diffLayout === "sideBySide";
  const canNavigateHunk = mode === "diff";
  const editorKey = `${path}:${mode}:${diffLayout}:${foldUnchanged ? "fold" : "full"}`;
  const commonOptions = {
    ...monacoCommonOptions,
    automaticLayout: true,
    fontFamily: readMonoFont(),
  };

  function handleBeforeMount(monaco: Monaco): void {
    applyJlGitMonacoTheme(monaco);
  }

  function goHunk(direction: "prev" | "next"): void {
    if (!diffEditorRef.current) {
      return;
    }
    navigateDiffHunk(diffEditorRef.current, direction);
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <DiffPreviewToolbar
        encoding={encoding}
        onEncodingChange={onEncodingChange}
        encodingDisabled={diff.binary}
        encodingDisplayLabel={diff.binary ? "HEX" : undefined}
        mode={mode}
        onModeChange={setMode}
        canNavigateHunk={canNavigateHunk}
        onPrevHunk={() => goHunk("prev")}
        onNextHunk={() => goHunk("next")}
        diffLayout={diffLayout}
        onDiffLayoutChange={setDiffLayout}
        foldUnchanged={foldUnchanged}
        onFoldUnchangedChange={setFoldUnchanged}
        diffToolsDisabled={mode !== "diff"}
      />

      {mode === "diff" ? (
        <>
          {sideBySide ? (
            <div className="border-border text-muted-foreground grid shrink-0 grid-cols-2 border-b text-[11px]">
              <DiffRevisionLabel label={base} lineEnding={diff.binary ? "HEX" : detectLineEnding(diff.oldText)} />
              <DiffRevisionLabel label={target} lineEnding={diff.binary ? "HEX" : detectLineEnding(diff.newText)} bordered={false} />
            </div>
          ) : (
            <div className="border-border text-muted-foreground flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1 text-[11px]">
              <span className="truncate">{target}</span>
              <span className="shrink-0 tabular-nums opacity-70">{diff.binary ? "HEX" : detectLineEnding(diff.newText)}</span>
            </div>
          )}
          <div className="min-h-0 min-w-0 flex-1">
            <DiffEditor
              key={editorKey}
              height="100%"
              language={diff.binary ? "plaintext" : languageFromPath(path)}
              original={diff.oldText}
              modified={diff.newText}
              theme={getJlGitMonacoThemeName(dark)}
              beforeMount={handleBeforeMount}
              onMount={(editor) => {
                diffEditorRef.current = editor;
              }}
              options={{
                ...commonOptions,
                renderSideBySide: sideBySide,
                renderSideBySideInlineBreakpoint: sideBySide ? 0 : 10_000,
                useInlineViewWhenSpaceIsLimited: !sideBySide,
                originalEditable: false,
                enableSplitViewResizing: sideBySide,
                hideUnchangedRegions: {
                  enabled: foldUnchanged,
                  revealLineCount: 1,
                  minimumLineCount: 3,
                  contextLineCount: 3,
                },
              } as ComponentProps<typeof DiffEditor>["options"]}
            />
          </div>
        </>
      ) : (
        <div className="min-h-0 min-w-0 flex-1">
          <Editor
            key={editorKey}
            height="100%"
            value={diff.newText}
            language={diff.binary ? "plaintext" : languageFromPath(path)}
            theme={getJlGitMonacoThemeName(dark)}
            beforeMount={handleBeforeMount}
            options={commonOptions}
          />
        </div>
      )}
    </div>
  );
}


interface DiffRevisionLabelProps {
  label: string;
  lineEnding: string;
  bordered?: boolean;
}

function DiffRevisionLabel({
  label,
  lineEnding,
  bordered = true,
}: DiffRevisionLabelProps) {
  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-1${bordered ? " border-border border-r" : ""}`}>
      <span className="truncate">{label}</span>
      <span className="shrink-0 tabular-nums opacity-70">{lineEnding}</span>
    </div>
  );
}
