import { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";

interface RepositoryTreeRootProps {
  name: string;
  rootKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  children: ReactNode;
}

/** Git 文件树统一的仓库根目录节点。 */
export function RepositoryTreeRoot({
  name,
  rootKey,
  expanded,
  onToggle,
  children,
}: RepositoryTreeRootProps) {
  return (
    <li role="treeitem" aria-expanded={expanded}>
      <button
        type="button"
        className="hover:bg-accent/60 flex h-7 w-full cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs font-medium"
        onClick={() => onToggle(rootKey)}
      >
        {expanded ? (
          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
        )}
        <MaterialFileIcon name={name} isDir className="size-3.5" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </button>
      {expanded ? <ul role="group">{children}</ul> : null}
    </li>
  );
}
