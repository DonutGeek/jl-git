import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeftRight, FileSearch, Files, GitCommitHorizontal, GitCompareArrows } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { BranchCompareFilePreview } from "@/components/git/BranchCompareFilePreview";
import { DiffLineStats } from "@/components/git/DiffLineStats";
import { EmptyState } from "@/components/common/EmptyState";
import { TruncateStartPath } from "@/components/common/TruncateStartPath";
import { SplitPane } from "@/components/layout/SplitPane";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SelectMenu } from "@/components/common/SelectMenu";
import { getBranchCompare, getBranchFileDiff, getCommit, getLog } from "@/services/git";
import { cn } from "@/lib/utils";
import type { BranchCompareMode, GitBranch, GitChangedFile, GitCommitDetail, GitCommitSummary, GitDiffResult } from "@/types/git";
import type { Project } from "@/types/project";
import { toUserMessage } from "@/types/error";
import { gitStatusLetterClass } from "@/utils/gitStatusStyle";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

interface BranchCompareWorkspaceProps {
  project: Project;
  branches: readonly GitBranch[];
  initialMode: BranchCompareMode;
  initialBase: string;
  initialTarget: string;
}

type CompareView = "files" | "commits";

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

/** 只读分支比较的三段式工作区。 */
export function BranchCompareWorkspace({ project, branches, initialMode, initialBase, initialTarget }: BranchCompareWorkspaceProps) {
  const { t } = useTranslation();
  const localBranches = useMemo(() => branches.filter((branch) => !branch.isRemote), [branches]);
  const allOptions = useMemo(() => branches.map((branch) => ({ value: branch.name, label: branch.name })), [branches]);
  const currentBranch = branches.find((branch) => branch.isCurrent)?.name ?? localBranches[0]?.name ?? "";
  const [mode, setMode] = useState<BranchCompareMode>(initialMode);
  const [base, setBase] = useState(initialBase || currentBranch);
  const [target, setTarget] = useState(initialTarget);
  const [view, setView] = useState<CompareView>("files");
  const [files, setFiles] = useState<GitChangedFile[] | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [encoding, setEncoding] = useState(DEFAULT_TEXT_ENCODING);
  const [commitLists, setCommitLists] = useState<{ baseOnly: GitCommitSummary[]; targetOnly: GitCommitSummary[] } | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitDetail | null>(null);
  const requestId = useRef(0);
  const diffRequestId = useRef(0);

  const upstream = localBranches.find((branch) => branch.name === base)?.upstream ?? "";
  const effectiveTarget = mode === "localUpstream" ? upstream : target;
  const visibleFiles = useMemo(() => files?.filter((file) => file.path.toLowerCase().includes(fileFilter.trim().toLowerCase())) ?? [], [fileFilter, files]);
  const summary = useMemo(() => summarizeFiles(files ?? []), [files]);

  useEffect(() => {
    if (mode === "localUpstream") {
      setTarget(upstream);
    }
  }, [mode, upstream]);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setFiles(null); setSelectedPath(null); setDiff(null); setFileError(null); setCommitLists(null); setSelectedCommit(null);
    if (!base || !effectiveTarget) return;
    if (view === "files") {
      void getBranchCompare(project.path, { base, target: effectiveTarget })
        .then((result) => {
          if (currentRequest !== requestId.current) return;
          setFiles(result.files);
          setSelectedPath(result.files[0]?.path ?? null);
        })
        .catch((reason: unknown) => {
          if (currentRequest === requestId.current) setFileError(toUserMessage(reason) || t("branchCompare.loadFilesFailed"));
        });
      return;
    }
    void Promise.all([
      getLog(project.path, { ref: `${effectiveTarget}..${base}`, limit: 100 }),
      getLog(project.path, { ref: `${base}..${effectiveTarget}`, limit: 100 }),
    ]).then(([baseOnly, targetOnly]) => {
      if (currentRequest === requestId.current) setCommitLists({ baseOnly: baseOnly.commits, targetOnly: targetOnly.commits });
    }).catch((reason: unknown) => {
      if (currentRequest === requestId.current) setFileError(toUserMessage(reason) || t("branchCompare.loadCommitsFailed"));
    });
  }, [base, effectiveTarget, project.path, t, view]);

  useEffect(() => {
    const currentRequest = ++diffRequestId.current;
    setDiff(null); setDiffError(null);
    if (!selectedPath || !base || !effectiveTarget) return;
    void getBranchFileDiff(project.path, { base, target: effectiveTarget, filePath: selectedPath, encoding })
      .then((result) => { if (currentRequest === diffRequestId.current) setDiff(result); })
      .catch((reason: unknown) => { if (currentRequest === diffRequestId.current) setDiffError(toUserMessage(reason) || t("branchCompare.loadDiffFailed")); });
  }, [base, effectiveTarget, encoding, project.path, selectedPath, t]);

  function selectLocalBranch(nextBase: string): void {
    setBase(nextBase);
    if (mode === "localUpstream") setTarget(localBranches.find((branch) => branch.name === nextBase)?.upstream ?? "");
  }

  function swapRefs(): void { setBase(effectiveTarget); setTarget(base); }

  async function selectCommit(commit: GitCommitSummary): Promise<void> {
    setSelectedCommit(null);
    try { setSelectedCommit((await getCommit(project.path, commit.id)).commit); }
    catch (reason) { setFileError(toUserMessage(reason) || t("branchCompare.loadCommitFailed")); }
  }

  return <main className="bg-background text-foreground flex h-screen min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden">
    <header data-tauri-drag-region className="border-border bg-muted/40 flex h-12 shrink-0 items-center border-b px-4 pl-[88px]">
      <span className="truncate text-sm font-semibold" title={t("branchCompare.windowTitle", { path: project.path })}>
        {t("branchCompare.windowTitle", { path: project.path })}
      </span>
    </header>
    <section className="border-border grid h-14 shrink-0 grid-cols-[auto_11rem_auto_minmax(0,1fr)_auto_auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-4" style={noDragStyle}>
      <GitCompareArrows className="size-5 shrink-0" aria-hidden="true" />
      <SelectMenu value={mode} ariaLabel={t("branchCompare.title")} onChange={(value) => setMode(value as BranchCompareMode)} options={[{ value: "branch", label: t("branchCompare.modeBranch") }, { value: "localUpstream", label: t("branchCompare.modeLocalUpstream") }]} triggerClassName="w-44" />
      <span className="shrink-0 whitespace-nowrap text-sm font-medium">{t("branchCompare.source")}</span>
      <SelectMenu value={base} ariaLabel={t("branchCompare.source")} onChange={mode === "localUpstream" ? selectLocalBranch : setBase} options={mode === "localUpstream" ? localBranches.map((branch) => ({ value: branch.name, label: branch.name })) : allOptions} triggerClassName="min-w-0 w-full" />
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t("branchCompare.swap")} disabled={mode === "localUpstream"} onClick={swapRefs}><ArrowLeftRight className="size-4" /></Button>
      <span className="shrink-0 whitespace-nowrap text-sm font-medium">{t("branchCompare.target")}</span>
      <SelectMenu value={effectiveTarget} ariaLabel={t("branchCompare.target")} onChange={setTarget} disabled={mode === "localUpstream"} options={allOptions} triggerClassName="min-w-0 w-full" />
      <div className="flex shrink-0 items-center rounded-md border p-0.5 text-sm" role="tablist">
        {(["files", "commits"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)} className={cn("rounded px-3 py-1", view === item && "bg-primary text-primary-foreground")}>{t(`branchCompare.${item}`)}</button>)}
      </div>
    </section>
    {mode === "localUpstream" && !effectiveTarget ? <p className="border-border text-muted-foreground shrink-0 border-b px-4 py-2 text-xs">{t("branchCompare.noUpstream")}</p> : null}
    {view === "files" ? (
      <SplitPane
        orientation="horizontal"
        defaultRatio={25}
        minFirstPx={200}
        minSecondPx={420}
        storageKey="jlgit:split:branch-compare-files"
        first={(
          <aside className="flex h-full min-h-0 flex-col">
            <div className="border-border border-b px-3 py-2 text-xs font-medium">
              {t("branchCompare.changedFiles", summary)}
            </div>
            <div className="p-2">
              <Input className="h-8 text-xs" value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} placeholder={t("branchCompare.filterFiles")} />
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {fileError ? <p className="text-destructive p-3 text-xs">{fileError}</p> : visibleFiles.length ? <div className="space-y-0.5 px-1 py-0.5">{visibleFiles.map((file) => (
                <button type="button" key={file.path} onClick={() => setSelectedPath(file.path)} className={cn("hover:bg-accent flex h-7 w-full min-w-0 items-center gap-1 rounded-md px-2 text-left text-xs transition-colors", selectedPath === file.path && "bg-accent text-accent-foreground")}>
                  <span className={cn("w-3.5 shrink-0 text-center font-mono text-[11px] leading-none font-semibold", gitStatusLetterClass(file.status))}>{file.status}</span>
                  <MaterialFileIcon name={file.path} isDir={false} className="size-3.5 shrink-0" />
                  <TruncateStartPath className="min-w-0 flex-1" path={file.path} />
                  <DiffLineStats additions={file.additions} deletions={file.deletions} className="ml-0" />
                </button>
              ))}</div> : <EmptyState compact icon={<Files />} title={t("branchCompare.noFiles")} description={t("branchCompare.noFilesDescription")} />}
            </ScrollArea>
          </aside>
        )}
        second={(
          <section className="min-w-0 h-full">
            {diffError ? <p className="text-destructive p-4 text-sm">{diffError}</p> : !selectedPath ? (
              <EmptyState className="h-full" icon={<FileSearch />} title={t("branchCompare.selectFile")} description={t("branchCompare.selectFileDescription")} />
            ) : !diff ? <p className="text-muted-foreground p-4 text-sm">{t("branchCompare.loading")}</p> : <BranchCompareFilePreview repoPath={project.path} base={base} target={effectiveTarget} path={selectedPath} diff={diff} encoding={encoding} onEncodingChange={setEncoding} />}
          </section>
        )}
      />
    ) : (
      <div className="min-h-0 flex-1 grid grid-cols-[minmax(15rem,1fr)_minmax(15rem,1fr)_minmax(22rem,1.3fr)]">
        <CommitColumn title={t("branchCompare.baseOnly", { branch: base })} commits={commitLists?.baseOnly ?? []} onSelect={selectCommit} />
        <CommitColumn title={t("branchCompare.targetOnly", { branch: effectiveTarget })} commits={commitLists?.targetOnly ?? []} onSelect={selectCommit} />
        <CommitDetail commit={selectedCommit} />
      </div>
    )}
  </main>;
}

function CommitColumn({ title, commits, onSelect }: { title: string; commits: readonly GitCommitSummary[]; onSelect: (commit: GitCommitSummary) => void }) {
  const { t } = useTranslation();
  return <section className="border-border min-w-0 border-r"><h2 className="border-border border-b px-3 py-2 text-sm font-medium truncate">{title}</h2><ScrollArea className="h-[calc(100%-2.5rem)]">{commits.length ? commits.map((commit) => <button type="button" key={commit.id} onClick={() => void onSelect(commit)} className="hover:bg-accent block w-full border-b px-3 py-2 text-left text-xs"><p className="text-muted-foreground font-mono">{commit.shortId}</p><p className="truncate">{commit.subject}</p></button>) : <EmptyState compact icon={<GitCommitHorizontal />} title={t("branchCompare.noUniqueCommits")} />}</ScrollArea></section>;
}

function CommitDetail({ commit }: { commit: GitCommitDetail | null }) {
  const { t } = useTranslation();
  return <section className="min-w-0 h-full p-4">{!commit ? <EmptyState className="h-full" icon={<GitCommitHorizontal />} title={t("branchCompare.selectCommit")} description={t("branchCompare.selectCommitDescription")} /> : <><h2 className="text-sm font-semibold">{commit.subject}</h2><p className="text-muted-foreground mt-1 font-mono text-xs">{commit.id}</p><p className="text-muted-foreground mt-3 text-xs">{commit.authorName} · {commit.authoredAt}</p><pre className="mt-4 whitespace-pre-wrap text-xs">{commit.body}</pre></>}</section>;
}
function summarizeFiles(files: readonly GitChangedFile[]) { return { total: files.length, added: files.filter((file) => file.status === "A").length, modified: files.filter((file) => !["A", "D"].includes(file.status)).length, deleted: files.filter((file) => file.status === "D").length }; }
