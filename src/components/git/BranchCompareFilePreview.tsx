import { TextDiffPreview } from "@/components/git/TextDiffPreview";
import type { GitDiffResult } from "@/types/git";

interface BranchCompareFilePreviewProps {
  base: string;
  target: string;
  path: string;
  diff: GitDiffResult;
  encoding: string;
  onEncodingChange: (encoding: string) => void;
}

/** 分支比较文件预览：复用 TextDiffPreview（工具栏 / Monaco / 右侧预览条）。 */
export function BranchCompareFilePreview({
  base,
  target,
  path,
  diff,
  encoding,
  onEncodingChange,
}: BranchCompareFilePreviewProps) {
  return (
    <TextDiffPreview
      path={path}
      diff={diff}
      selectionKey={`${base}\0${target}\0${path}`}
      encoding={encoding}
      onEncodingChange={onEncodingChange}
      oldLabel={<span className="truncate">{base}</span>}
      newLabel={<span className="truncate">{target}</span>}
      binaryEncodingLabel="HEX"
      allowBinaryEditor
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    />
  );
}
