import { ChevronDown, ChevronRight } from "lucide-react";

import { HighlightText } from "@/components/common/HighlightText";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";

/** 树形目录 / 根节点行（供虚拟列表复用） */
export function ChangeTreeFolderRow({
  name,
  open,
  depth,
  onToggle,
  highlightQuery = "",
}: {
  name: string;
  open: boolean;
  /** 根节点传 undefined，目录从 1 起 */
  depth?: number;
  onToggle: () => void;
  highlightQuery?: string;
}) {
  const isRoot = depth == null;

  return (
    <button
      type="button"
      className={
        isRoot
          ? "hover:bg-accent/60 flex h-7 w-full cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs font-medium"
          : "hover:bg-accent/60 flex h-7 w-full cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs"
      }
      style={isRoot ? undefined : { paddingLeft: `${6 + depth * 14}px` }}
      onClick={onToggle}
    >
      {open ? (
        <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      )}
      <MaterialFileIcon name={name} isDir className="size-3.5" />
      <HighlightText text={name} query={highlightQuery} className="min-w-0 flex-1 truncate" />
    </button>
  );
}
