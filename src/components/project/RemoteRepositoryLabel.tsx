import type { KeyboardEvent, MouseEvent } from "react";
import { GitFork } from "lucide-react";

import { cn } from "@/lib/utils";

import { RemoteRepository } from "@/utils/remoteRepository";

interface RemoteRepositoryLabelProps {
  remote: RemoteRepository;
  onOpen: (url: string) => void;
  /** 覆盖默认样式（最近列表默认右对齐；详情等场景可左对齐） */
  className?: string;
}

function stopAndOpen(
  event: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>,
  url: string,
  onOpen: (url: string) => void,
): void {
  event.preventDefault();
  event.stopPropagation();
  onOpen(url);
}

/** 最近项目行中的远程仓库托管平台与名称。 */
export function RemoteRepositoryLabel({
  remote,
  onOpen,
  className,
}: RemoteRepositoryLabelProps) {
  return (
    <span
      role="link"
      tabIndex={0}
      className={cn(
        "text-primary focus-visible:ring-ring ml-auto flex max-w-[46%] shrink-0 cursor-pointer items-center gap-1 rounded-sm font-mono text-xs hover:underline focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      title={remote.url}
      onDoubleClick={(event) => stopAndOpen(event, remote.url, onOpen)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          stopAndOpen(event, remote.url, onOpen);
        }
      }}
    >
      <GitFork className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{remote.repositoryName}</span>
    </span>
  );
}
